// SPDX-License-Identifier: Apache-2.0

//! Work-stealing job system and concurrent task graph.
//!
//! Powered by `rayon` with explicit dependency tracking, synchronization barriers,
//! and lock-free thread notification primitives.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

/// A handle to an asynchronously scheduled task.
#[derive(Clone)]
pub struct JobHandle {
    completed: Arc<AtomicBool>,
}

impl JobHandle {
    /// Creates a new unfinished job handle.
    #[must_use]
    pub fn new() -> Self {
        Self { completed: Arc::new(AtomicBool::new(false)) }
    }

    /// Checks if the job has finished executing.
    #[inline]
    #[must_use]
    pub fn is_completed(&self) -> bool {
        self.completed.load(Ordering::Acquire)
    }

    /// Busy-waits/spins until the job is completed.
    pub fn wait(&self) {
        while !self.is_completed() {
            std::hint::spin_loop();
        }
    }

    /// Marks the job as completed.
    #[inline]
    pub fn complete(&self) {
        self.completed.store(true, Ordering::Release);
    }
}

impl Default for JobHandle {
    fn default() -> Self {
        Self::new()
    }
}

/// A node in a task graph with prerequisite dependencies.
pub struct JobNode {
    #[allow(dead_code)]
    id: usize,
    dependencies: Vec<usize>,
    task: Box<dyn Fn() + Send + Sync>,
}

/// A Directed Acyclic Graph (DAG) of jobs executed across worker threads.
pub struct JobGraph {
    nodes: Vec<JobNode>,
}

impl Default for JobGraph {
    fn default() -> Self {
        Self::new()
    }
}

impl JobGraph {
    /// Creates a new empty job graph.
    #[must_use]
    pub fn new() -> Self {
        Self { nodes: Vec::new() }
    }

    /// Adds a job with no dependencies, returning its index.
    pub fn add_job<F>(&mut self, task: F) -> usize
    where
        F: Fn() + 'static + Send + Sync,
    {
        let id = self.nodes.len();
        self.nodes.push(JobNode { id, dependencies: Vec::new(), task: Box::new(task) });
        id
    }

    /// Adds a job that must only execute after `depends_on` has finished.
    pub fn add_dependent_job<F>(&mut self, depends_on: usize, task: F) -> usize
    where
        F: Fn() + 'static + Send + Sync,
    {
        let id = self.nodes.len();
        self.nodes.push(JobNode { id, dependencies: vec![depends_on], task: Box::new(task) });
        id
    }

    /// Executes the entire job graph utilizing `rayon`'s work-stealing pool.
    pub fn execute(&self) {
        if self.nodes.is_empty() {
            return;
        }

        let handles: Vec<JobHandle> = (0..self.nodes.len()).map(|_| JobHandle::new()).collect();

        rayon::scope(|s| {
            for (idx, node) in self.nodes.iter().enumerate() {
                let node_task = &node.task;
                let handle = handles[idx].clone();
                let deps: Vec<JobHandle> =
                    node.dependencies.iter().map(|&dep_idx| handles[dep_idx].clone()).collect();

                s.spawn(move |_| {
                    for dep in deps {
                        dep.wait();
                    }
                    node_task();
                    handle.complete();
                });
            }
        });
    }
}

/// Synchronization barrier for worker threads.
pub struct JobBarrier {
    counter: Arc<AtomicUsize>,
    target: usize,
}

impl JobBarrier {
    /// Creates a new barrier for `target` participants.
    #[must_use]
    pub fn new(target: usize) -> Self {
        Self { counter: Arc::new(AtomicUsize::new(0)), target }
    }

    /// Increments the barrier count and waits until all participants have arrived.
    pub fn arrive_and_wait(&self) {
        let prev = self.counter.fetch_add(1, Ordering::AcqRel);
        if prev + 1 >= self.target {
            // Last one arrived, target reached
            return;
        }
        while self.counter.load(Ordering::Acquire) < self.target {
            std::hint::spin_loop();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicI32;

    #[test]
    fn test_job_graph_dependency_ordering() {
        let mut graph = JobGraph::new();
        let value = Arc::new(AtomicI32::new(0));

        let v1 = Arc::clone(&value);
        let j1 = graph.add_job(move || {
            v1.store(10, Ordering::SeqCst);
        });

        let v2 = Arc::clone(&value);
        let _j2 = graph.add_dependent_job(j1, move || {
            // j2 must observe j1 having written 10
            let current = v2.load(Ordering::SeqCst);
            assert_eq!(current, 10);
            v2.store(20, Ordering::SeqCst);
        });

        graph.execute();
        assert_eq!(value.load(Ordering::SeqCst), 20);
    }
}
