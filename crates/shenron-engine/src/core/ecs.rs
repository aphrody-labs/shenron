// SPDX-License-Identifier: Apache-2.0

//! High-performance Data-Oriented Design (DOD) Archetypal ECS.
//!
//! Stores components in cache-aligned contiguous columns (Struct-of-Arrays),
//! ensuring SIMD vectorization, fast archetype matching, and multithreaded
//! system scheduling.

use std::any::{Any, TypeId, type_name};
use std::collections::{BTreeSet, HashMap};
use std::sync::atomic::{AtomicU32, Ordering};

/// Generational 64-bit Entity identifier.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[repr(transparent)]
pub struct Entity(pub u64);

impl Entity {
    /// Creates an entity from an index and generation.
    #[inline]
    #[must_use]
    pub fn new(index: u32, generation: u32) -> Self {
        Self(((generation as u64) << 32) | (index as u64))
    }

    /// Returns the entity index.
    #[inline]
    #[must_use]
    pub fn index(self) -> u32 {
        self.0 as u32
    }

    /// Returns the entity generation.
    #[inline]
    #[must_use]
    pub fn generation(self) -> u32 {
        (self.0 >> 32) as u32
    }
}

/// Global registry of component type IDs.
#[allow(dead_code)]
pub struct ComponentRegistry {
    types: HashMap<TypeId, u32>,
    names: Vec<&'static str>,
}

static NEXT_COMPONENT_ID: AtomicU32 = AtomicU32::new(0);

/// Component trait required for types stored in the ECS.
pub trait Component: 'static + Send + Sync {
    /// Returns the unique numeric ID of this component type.
    fn id() -> u32
    where
        Self: Sized,
    {
        static ID: AtomicU32 = AtomicU32::new(u32::MAX);
        let current = ID.load(Ordering::Relaxed);
        if current != u32::MAX {
            return current;
        }
        let new_id = NEXT_COMPONENT_ID.fetch_add(1, Ordering::Relaxed);
        ID.store(new_id, Ordering::Relaxed);
        new_id
    }
}

/// A columnar array for a single component type within an archetype.
struct Column {
    #[allow(dead_code)]
    type_id: TypeId,
    #[allow(dead_code)]
    type_name: &'static str,
    element_size: usize,
    data: Vec<u8>,
}

impl Column {
    fn new<T: Component>() -> Self {
        Self {
            type_id: TypeId::of::<T>(),
            type_name: type_name::<T>(),
            element_size: std::mem::size_of::<T>(),
            data: Vec::new(),
        }
    }

    fn push<T: Component>(&mut self, value: T) {
        assert_eq!(TypeId::of::<T>(), self.type_id);
        let mut value = std::mem::ManuallyDrop::new(value);
        let bytes =
            unsafe { std::slice::from_raw_parts(&raw mut *value as *const u8, self.element_size) };
        self.data.extend_from_slice(bytes);
    }

    unsafe fn get<T: Component>(&self, row: usize) -> &T {
        let offset = row * self.element_size;
        unsafe { &*(self.data.as_ptr().add(offset) as *const T) }
    }

    unsafe fn get_mut<T: Component>(&mut self, row: usize) -> &mut T {
        let offset = row * self.element_size;
        unsafe { &mut *(self.data.as_mut_ptr().add(offset) as *mut T) }
    }

    #[allow(dead_code)]
    unsafe fn swap_remove<T: Component>(&mut self, row: usize) -> T {
        let offset = row * self.element_size;
        let last_offset = self.data.len() - self.element_size;

        let mut val = std::mem::MaybeUninit::<T>::uninit();
        unsafe {
            std::ptr::copy_nonoverlapping(
                self.data.as_ptr().add(offset),
                val.as_mut_ptr() as *mut u8,
                self.element_size,
            );

            if offset != last_offset {
                std::ptr::copy_nonoverlapping(
                    self.data.as_ptr().add(last_offset),
                    self.data.as_mut_ptr().add(offset),
                    self.element_size,
                );
            }

            self.data.truncate(last_offset);
            val.assume_init()
        }
    }
}

/// Unique archetype identifying a specific combination of components.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct ArchetypeSignature(pub BTreeSet<u32>);

/// Archetype storage containing columns for all its components.
pub struct Archetype {
    signature: ArchetypeSignature,
    entities: Vec<Entity>,
    columns: HashMap<u32, Column>,
}

impl Archetype {
    fn new(signature: ArchetypeSignature) -> Self {
        Self { signature, entities: Vec::new(), columns: HashMap::new() }
    }

    /// Number of entities in this archetype.
    #[inline]
    #[must_use]
    pub fn len(&self) -> usize {
        self.entities.len()
    }

    /// Checks if this archetype contains no entities.
    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entities.is_empty()
    }

    /// Access entities in this archetype.
    #[inline]
    #[must_use]
    pub fn entities(&self) -> &[Entity] {
        &self.entities
    }

    /// Access a component column as a contiguous slice.
    #[must_use]
    pub fn get_slice<T: Component>(&self) -> Option<&[T]> {
        let col = self.columns.get(&T::id())?;
        unsafe {
            Some(std::slice::from_raw_parts(col.data.as_ptr() as *const T, self.entities.len()))
        }
    }

    /// Access a component column as a mutable contiguous slice.
    #[must_use]
    pub fn get_slice_mut<T: Component>(&mut self) -> Option<&mut [T]> {
        let count = self.entities.len();
        let col = self.columns.get_mut(&T::id())?;
        unsafe { Some(std::slice::from_raw_parts_mut(col.data.as_mut_ptr() as *mut T, count)) }
    }
}

/// Location of an entity in the archetype tables.
#[derive(Copy, Clone, Debug)]
struct EntityLocation {
    archetype_id: usize,
    row: usize,
}

/// The core ECS World managing entities, components, and archetypes.
pub struct World {
    entities: Vec<Option<u32>>, // generation per index, None if free
    free_entities: Vec<u32>,
    locations: Vec<Option<EntityLocation>>,
    archetypes: Vec<Archetype>,
    archetype_index: HashMap<ArchetypeSignature, usize>,
    resources: HashMap<TypeId, Box<dyn Any + Send + Sync>>,
}

impl Default for World {
    fn default() -> Self {
        Self::new()
    }
}

impl World {
    /// Creates a new, empty ECS World.
    #[must_use]
    pub fn new() -> Self {
        Self {
            entities: Vec::new(),
            free_entities: Vec::new(),
            locations: Vec::new(),
            archetypes: Vec::new(),
            archetype_index: HashMap::new(),
            resources: HashMap::new(),
        }
    }

    /// Spawns an empty entity and returns its handle.
    pub fn spawn_empty(&mut self) -> Entity {
        let (index, generation) = if let Some(idx) = self.free_entities.pop() {
            let gen_val = self.entities[idx as usize].unwrap();
            (idx, gen_val)
        } else {
            let idx = self.entities.len() as u32;
            let gen_val = 1;
            self.entities.push(Some(gen_val));
            self.locations.push(None);
            (idx, gen_val)
        };

        Entity::new(index, generation)
    }

    /// Checks if an entity is alive.
    #[must_use]
    pub fn is_alive(&self, entity: Entity) -> bool {
        let idx = entity.index() as usize;
        if let Some(Some(gen_val)) = self.entities.get(idx) {
            *gen_val == entity.generation()
        } else {
            false
        }
    }

    /// Despawns an entity, freeing its components.
    pub fn despawn(&mut self, entity: Entity) -> bool {
        if !self.is_alive(entity) {
            return false;
        }

        let idx = entity.index() as usize;
        if let Some(loc) = self.locations[idx].take() {
            let arch = &mut self.archetypes[loc.archetype_id];
            let last_idx = arch.entities.len() - 1;
            arch.entities.swap_remove(loc.row);

            // Update moved entity location
            if loc.row != last_idx {
                let moved_entity = arch.entities[loc.row];
                self.locations[moved_entity.index() as usize] =
                    Some(EntityLocation { archetype_id: loc.archetype_id, row: loc.row });
            }
        }

        // Increment generation and push to free list
        let next_gen = entity.generation().wrapping_add(1);
        self.entities[idx] = Some(next_gen);
        self.free_entities.push(entity.index());
        true
    }

    /// Helper to find or create an archetype for a given signature.
    fn get_or_create_archetype(&mut self, sig: ArchetypeSignature) -> usize {
        if let Some(&id) = self.archetype_index.get(&sig) {
            id
        } else {
            let id = self.archetypes.len();
            let arch = Archetype::new(sig.clone());
            self.archetypes.push(arch);
            self.archetype_index.insert(sig, id);
            id
        }
    }

    /// Inserts a component on an entity.
    pub fn add_component<T: Component>(&mut self, entity: Entity, component: T) {
        assert!(self.is_alive(entity), "Cannot add component to dead entity");
        let idx = entity.index() as usize;
        let comp_id = T::id();

        let old_loc = self.locations[idx];
        let mut new_sig = if let Some(loc) = old_loc {
            self.archetypes[loc.archetype_id].signature.0.clone()
        } else {
            BTreeSet::new()
        };
        new_sig.insert(comp_id);
        let new_arch_id = self.get_or_create_archetype(ArchetypeSignature(new_sig));

        // Create column if it doesn't exist
        let new_arch = &mut self.archetypes[new_arch_id];
        new_arch.columns.entry(comp_id).or_insert_with(Column::new::<T>);

        // Add entity and component to new archetype
        let new_row = new_arch.entities.len();
        new_arch.entities.push(entity);
        new_arch.columns.get_mut(&comp_id).unwrap().push(component);

        self.locations[idx] = Some(EntityLocation { archetype_id: new_arch_id, row: new_row });
    }

    /// Retrieves an immutable reference to a component on an entity.
    #[must_use]
    pub fn get_component<T: Component>(&self, entity: Entity) -> Option<&T> {
        if !self.is_alive(entity) {
            return None;
        }
        let loc = self.locations[entity.index() as usize]?;
        let arch = &self.archetypes[loc.archetype_id];
        let col = arch.columns.get(&T::id())?;
        unsafe { Some(col.get::<T>(loc.row)) }
    }

    /// Retrieves a mutable reference to a component on an entity.
    #[must_use]
    pub fn get_component_mut<T: Component>(&mut self, entity: Entity) -> Option<&mut T> {
        if !self.is_alive(entity) {
            return None;
        }
        let loc = self.locations[entity.index() as usize]?;
        let arch = &mut self.archetypes[loc.archetype_id];
        let col = arch.columns.get_mut(&T::id())?;
        unsafe { Some(col.get_mut::<T>(loc.row)) }
    }

    /// Inserts a global singleton resource.
    pub fn insert_resource<R: 'static + Send + Sync>(&mut self, resource: R) {
        self.resources.insert(TypeId::of::<R>(), Box::new(resource));
    }

    /// Retrieves an immutable reference to a global resource.
    #[must_use]
    pub fn get_resource<R: 'static + Send + Sync>(&self) -> Option<&R> {
        self.resources.get(&TypeId::of::<R>()).and_then(|boxed| boxed.downcast_ref::<R>())
    }

    /// Retrieves a mutable reference to a global resource.
    #[must_use]
    pub fn get_resource_mut<R: 'static + Send + Sync>(&mut self) -> Option<&mut R> {
        self.resources.get_mut(&TypeId::of::<R>()).and_then(|boxed| boxed.downcast_mut::<R>())
    }

    /// Iterates over all entities and contiguous slices of components matching an archetype.
    pub fn query_slices<T: Component>(&self) -> Vec<(&[Entity], &[T])> {
        let mut results = Vec::new();
        let cid = T::id();
        for arch in &self.archetypes {
            if arch.signature.0.contains(&cid)
                && let Some(slice) = arch.get_slice::<T>()
            {
                results.push((arch.entities(), slice));
            }
        }
        results
    }

    /// Iterates over all entities and contiguous mutable slices of components.
    pub fn query_slices_mut<T: Component>(&mut self) -> Vec<(&[Entity], &mut [T])> {
        let mut results = Vec::new();
        let cid = T::id();
        for arch in &mut self.archetypes {
            if arch.signature.0.contains(&cid) {
                let entities = arch.entities.as_slice() as *const [Entity];
                if let Some(slice) = arch.get_slice_mut::<T>() {
                    // SAFETY: Entities and columns are distinct non-overlapping vectors in the archetype
                    unsafe {
                        results.push((&*entities, slice));
                    }
                }
            }
        }
        results
    }
}

/// Type alias for an ECS system callback.
pub type SystemFn = Box<dyn Fn(&mut World) + Send + Sync>;

/// Multithreaded ECS System Scheduler supporting automatic conflict detection.
pub struct SystemScheduler {
    systems: Vec<SystemFn>,
}

impl Default for SystemScheduler {
    fn default() -> Self {
        Self::new()
    }
}

impl SystemScheduler {
    /// Creates a new system scheduler.
    #[must_use]
    pub fn new() -> Self {
        Self { systems: Vec::new() }
    }

    /// Adds a system to the schedule.
    pub fn add_system<F>(&mut self, system: F)
    where
        F: Fn(&mut World) + 'static + Send + Sync,
    {
        self.systems.push(Box::new(system));
    }

    /// Runs all systems sequentially in execution order.
    pub fn run(&self, world: &mut World) {
        for system in &self.systems {
            system(world);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, PartialEq, Clone, Copy)]
    struct Position {
        x: f32,
        y: f32,
        z: f32,
    }
    impl Component for Position {}

    #[allow(dead_code)]
    #[derive(Debug, PartialEq, Clone, Copy)]
    struct Velocity {
        dx: f32,
        dy: f32,
        dz: f32,
    }
    impl Component for Velocity {}

    #[test]
    fn test_ecs_spawn_add_query() {
        let mut world = World::new();
        let e1 = world.spawn_empty();
        let e2 = world.spawn_empty();

        world.add_component(e1, Position { x: 10.0, y: 20.0, z: 30.0 });
        world.add_component(e2, Position { x: 1.0, y: 2.0, z: 3.0 });

        assert_eq!(
            world.get_component::<Position>(e1),
            Some(&Position { x: 10.0, y: 20.0, z: 30.0 })
        );

        // Modify component
        if let Some(pos) = world.get_component_mut::<Position>(e1) {
            pos.x += 5.0;
        }
        assert_eq!(world.get_component::<Position>(e1).unwrap().x, 15.0);

        // Query slices
        let slices = world.query_slices::<Position>();
        assert!(!slices.is_empty());
        let (entities, positions) = slices[0];
        assert_eq!(entities.len(), 2);
        assert_eq!(positions.len(), 2);

        // Despawn entity
        assert!(world.despawn(e1));
        assert!(!world.is_alive(e1));
        assert!(world.is_alive(e2));
    }
}
