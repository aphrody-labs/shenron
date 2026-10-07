// SPDX-License-Identifier: Apache-2.0

//! High-performance frame arena and custom DOD memory allocators.
//!
//! Provides zero-allocation scratch memory per frame, handle-based generational
//! pools, and GPU-aligned staging ring buffers.

use std::alloc::{alloc, dealloc, Layout};
use std::cell::UnsafeCell;
use std::marker::PhantomData;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Default capacity for a single frame arena chunk (4 MiB).
pub const DEFAULT_FRAME_ARENA_CHUNK_SIZE: usize = 4 * 1024 * 1024;

/// A high-speed linear bump allocator dedicated to per-frame temporary allocations.
///
/// Ensures 64-byte alignment (cache-line and GPU uniform buffer boundary)
/// and zero kernel syscalls during the frame execution loop.
pub struct FrameArena {
    memory: *mut u8,
    capacity: usize,
    offset: AtomicUsize,
}

unsafe impl Send for FrameArena {}
unsafe impl Sync for FrameArena {}

impl FrameArena {
    /// Creates a new frame arena with the specified byte capacity.
    #[must_use]
    pub fn new(capacity: usize) -> Self {
        let align = 64; // Cache-line and GPU uniform buffer alignment
        let layout = Layout::from_size_align(capacity, align).expect("Valid arena layout");
        // SAFETY: Allocating uninitialized block of bytes of specified capacity and alignment.
        let memory = unsafe { alloc(layout) };
        assert!(!memory.is_null(), "Failed to allocate FrameArena memory");

        Self {
            memory,
            capacity,
            offset: AtomicUsize::new(0),
        }
    }

    /// Resets the bump pointer to zero.
    ///
    /// Must be called at the boundary between frames. Does not run destructors.
    #[inline]
    pub fn reset(&mut self) {
        self.offset.store(0, Ordering::Relaxed);
    }

    /// Allocates a contiguous slice of `count` uninitialized elements of type `T`.
    ///
    /// The alignment of `T` is strictly respected, padding up to the required boundary.
    #[allow(clippy::mut_from_ref)]
    pub fn alloc_slice<T>(&self, count: usize) -> Option<&mut [T]> {
        if count == 0 {
            return Some(&mut []);
        }

        let elem_size = std::mem::size_of::<T>();
        let elem_align = std::mem::align_of::<T>().max(16); // Minimum 16-byte alignment
        let total_bytes = elem_size.checked_mul(count)?;

        // Bump pointer with atomic compare-exchange loop for thread safety
        let mut current_offset = self.offset.load(Ordering::Relaxed);
        let aligned_offset = loop {
            let aligned = (current_offset + elem_align - 1) & !(elem_align - 1);
            let next = aligned.checked_add(total_bytes)?;
            if next > self.capacity {
                return None; // Out of arena space
            }

            match self.offset.compare_exchange_weak(
                current_offset,
                next,
                Ordering::AcqRel,
                Ordering::Relaxed,
            ) {
                Ok(_) => break aligned,
                Err(prev) => current_offset = prev,
            }
        };

        // SAFETY: Pointer is within bounds, correctly aligned, and exclusively claimed.
        unsafe {
            let ptr = self.memory.add(aligned_offset) as *mut T;
            Some(std::slice::from_raw_parts_mut(ptr, count))
        }
    }

    /// Returns the currently allocated bytes in this frame.
    #[inline]
    #[must_use]
    pub fn bytes_allocated(&self) -> usize {
        self.offset.load(Ordering::Relaxed)
    }

    /// Returns the total capacity in bytes.
    #[inline]
    #[must_use]
    pub fn capacity(&self) -> usize {
        self.capacity
    }
}

impl Drop for FrameArena {
    fn drop(&mut self) {
        let layout = Layout::from_size_align(self.capacity, 64).expect("Valid layout");
        // SAFETY: Deallocating the original memory block with its original layout.
        unsafe {
            dealloc(self.memory, layout);
        }
    }
}

/// Generational index handle for safe pool allocations without dangling pointers.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
pub struct PoolHandle<T> {
    /// Slot index in the pool.
    pub index: u32,
    /// Generation counter to prevent ABA reuse bugs.
    pub generation: u32,
    _marker: PhantomData<T>,
}

impl<T> PoolHandle<T> {
    /// Creates a handle.
    #[inline]
    #[must_use]
    pub fn new(index: u32, generation: u32) -> Self {
        Self {
            index,
            generation,
            _marker: PhantomData,
        }
    }
}

enum Slot<T> {
    Occupied { value: T, generation: u32 },
    Free { next_free: Option<u32>, generation: u32 },
}

/// Generational object pool with $O(1)$ allocation, $O(1)$ lookup, and $O(1)$ free.
pub struct PoolAllocator<T> {
    slots: Vec<Slot<T>>,
    free_head: Option<u32>,
    active_count: usize,
}

impl<T> Default for PoolAllocator<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> PoolAllocator<T> {
    /// Creates a new empty pool allocator.
    #[must_use]
    pub fn new() -> Self {
        Self {
            slots: Vec::new(),
            free_head: None,
            active_count: 0,
        }
    }

    /// Allocates a value in the pool and returns its generational handle.
    pub fn insert(&mut self, value: T) -> PoolHandle<T> {
        self.active_count += 1;
        if let Some(index) = self.free_head {
            let slot = &mut self.slots[index as usize];
            match slot {
                Slot::Free { next_free, generation } => {
                    let gen_val = *generation;
                    self.free_head = *next_free;
                    *slot = Slot::Occupied { value, generation: gen_val };
                    PoolHandle::new(index, gen_val)
                }
                Slot::Occupied { .. } => unreachable!("free_head pointed to occupied slot"),
            }
        } else {
            let index = self.slots.len() as u32;
            let generation = 1;
            self.slots.push(Slot::Occupied { value, generation });
            PoolHandle::new(index, generation)
        }
    }

    /// Retrieves an immutable reference to the value if the handle is valid.
    #[must_use]
    pub fn get(&self, handle: PoolHandle<T>) -> Option<&T> {
        match self.slots.get(handle.index as usize)? {
            Slot::Occupied { value, generation } if *generation == handle.generation => Some(value),
            _ => None,
        }
    }

    /// Retrieves a mutable reference to the value if the handle is valid.
    #[must_use]
    pub fn get_mut(&mut self, handle: PoolHandle<T>) -> Option<&mut T> {
        match self.slots.get_mut(handle.index as usize)? {
            Slot::Occupied { value, generation } if *generation == handle.generation => Some(value),
            _ => None,
        }
    }

    /// Removes the value corresponding to the handle, freeing the slot.
    pub fn remove(&mut self, handle: PoolHandle<T>) -> Option<T> {
        let slot = self.slots.get_mut(handle.index as usize)?;
        match slot {
            Slot::Occupied { generation, .. } if *generation == handle.generation => {
                let next_gen = generation.wrapping_add(1);
                let old_slot = std::mem::replace(
                    slot,
                    Slot::Free {
                        next_free: self.free_head,
                        generation: next_gen,
                    },
                );
                self.free_head = Some(handle.index);
                self.active_count -= 1;
                if let Slot::Occupied { value, .. } = old_slot {
                    Some(value)
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    /// Returns the number of currently active items in the pool.
    #[inline]
    #[must_use]
    pub fn len(&self) -> usize {
        self.active_count
    }

    /// Returns true if the pool contains no items.
    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.active_count == 0
    }
}

/// Circular ring buffer for GPU upload staging and lock-free data passing.
pub struct StagingRingBuffer<T: Copy> {
    buffer: Vec<UnsafeCell<T>>,
    capacity: usize,
    head: AtomicUsize,
    tail: AtomicUsize,
}

unsafe impl<T: Copy + Send> Send for StagingRingBuffer<T> {}
unsafe impl<T: Copy + Sync> Sync for StagingRingBuffer<T> {}

impl<T: Copy + Default> StagingRingBuffer<T> {
    /// Creates a staging ring buffer with the given capacity.
    #[must_use]
    pub fn new(capacity: usize) -> Self {
        assert!(capacity > 0, "Capacity must be greater than zero");
        let mut buffer = Vec::with_capacity(capacity);
        for _ in 0..capacity {
            buffer.push(UnsafeCell::new(T::default()));
        }
        Self {
            buffer,
            capacity,
            head: AtomicUsize::new(0),
            tail: AtomicUsize::new(0),
        }
    }

    /// Pushes an item into the ring buffer. Returns false if the buffer is full.
    pub fn push(&self, item: T) -> bool {
        let head = self.head.load(Ordering::Relaxed);
        let tail = self.tail.load(Ordering::Acquire);
        if head.wrapping_sub(tail) >= self.capacity {
            return false;
        }

        let index = head % self.capacity;
        // SAFETY: Only one writer at the current head position.
        unsafe {
            *self.buffer[index].get() = item;
        }
        self.head.store(head.wrapping_add(1), Ordering::Release);
        true
    }

    /// Pops an item from the ring buffer. Returns None if the buffer is empty.
    pub fn pop(&self) -> Option<T> {
        let tail = self.tail.load(Ordering::Relaxed);
        let head = self.head.load(Ordering::Acquire);
        if tail == head {
            return None;
        }

        let index = tail % self.capacity;
        // SAFETY: Safe to read item once head has advanced past tail.
        let item = unsafe { *self.buffer[index].get() };
        self.tail.store(tail.wrapping_add(1), Ordering::Release);
        Some(item)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_arena_bump_and_reset() {
        let mut arena = FrameArena::new(1024 * 1024);
        {
            let slice: &mut [f32] = arena.alloc_slice(100).expect("Allocation succeeds");
            assert_eq!(slice.len(), 100);
            slice[0] = 42.0;
            slice[99] = 99.0;
            assert_eq!(slice[0], 42.0);
            assert!(arena.bytes_allocated() >= 400);
        }
        arena.reset();
        assert_eq!(arena.bytes_allocated(), 0);
    }

    #[test]
    fn test_pool_allocator_generational_safety() {
        let mut pool = PoolAllocator::new();
        let h1 = pool.insert(100);
        let h2 = pool.insert(200);

        assert_eq!(pool.get(h1), Some(&100));
        assert_eq!(pool.get(h2), Some(&200));

        let removed = pool.remove(h1);
        assert_eq!(removed, Some(100));
        assert_eq!(pool.get(h1), None); // Old generation must return None

        // Reallocate slot
        let h3 = pool.insert(300);
        assert_eq!(h3.index, h1.index); // Same slot reused
        assert_ne!(h3.generation, h1.generation); // Different generation!
        assert_eq!(pool.get(h1), None); // Stale handle still fails
        assert_eq!(pool.get(h3), Some(&300));
    }
}
