// SPDX-License-Identifier: Apache-2.0
//! Cancellable jobs: a process-wide registry of `u64` ids to cancellation flags.
//!
//! Life of a job: `shenron_job_new` registers it (pending); one `*_job` export starts it
//! (running) on the caller's thread and removes it when it returns, whatever the outcome
//! (value, failure, cancellation, panic); `shenron_job_release` forgets a job that will never
//! run. `shenron_cancel` may come from any thread at any time: a pending job returns
//! `Status::Cancelled` as soon as it starts, a running one as soon as its work reaches an
//! await point (`select!` against the flag); blocking work runs on tokio's blocking pool so the
//! caller is released at once, the abandoned work finishing in the background.

use std::{
    collections::HashMap,
    future::Future,
    panic::{AssertUnwindSafe, catch_unwind},
    sync::{
        LazyLock, Mutex, MutexGuard, PoisonError,
        atomic::{AtomicU64, Ordering},
    },
};

use serde::Serialize;
use tokio::sync::watch;

use crate::{abi::Status, native, types::JobOutcome};

struct Entry {
    cancel: watch::Sender<bool>,
    running: bool,
}

static NEXT_JOB: AtomicU64 = AtomicU64::new(1);
static JOBS: LazyLock<Mutex<HashMap<u64, Entry>>> = LazyLock::new(Mutex::default);

fn registry() -> MutexGuard<'static, HashMap<u64, Entry>> {
    JOBS.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Register a pending job; ids start at 1 and are never reused.
pub(crate) fn create() -> u64 {
    let id = NEXT_JOB.fetch_add(1, Ordering::Relaxed);
    let (cancel, _) = watch::channel(false);
    registry().insert(id, Entry { cancel, running: false });
    id
}

/// Raise the cancellation flag of a registered job.
pub(crate) fn cancel(id: u64) -> bool {
    registry().get(&id).map(|entry| entry.cancel.send_replace(true)).is_some()
}

/// Cancel and forget a job (a running job sees its flag dropped and stops as cancelled).
pub(crate) fn release(id: u64) -> bool {
    registry().remove(&id).map(|entry| entry.cancel.send_replace(true)).is_some()
}

/// Registered jobs, pending or running.
pub(crate) fn count() -> usize {
    registry().len()
}

/// Why a job produced no value.
#[derive(Debug)]
pub(crate) enum JobError {
    /// The operation ran and failed.
    Failed(String),
    /// Malformed request.
    Usage(String),
    /// A panic caught inside the work (blocking pool).
    Software(String),
    /// The cancellation flag was raised.
    Cancelled,
}

/// A running job; dropping it removes the registry entry.
#[derive(Debug)]
pub(crate) struct Job {
    id: u64,
    cancel: watch::Receiver<bool>,
}

impl Job {
    /// Mark job `id` as running; an unknown, released, consumed or already running id is refused.
    fn start(id: u64) -> Result<Self, String> {
        let mut jobs = registry();
        match jobs.get_mut(&id) {
            None => Err(format!(
                "unknown job id {id}: create it with shenron_job_new; a job id is single-use"
            )),
            Some(entry) if entry.running => Err(format!("job {id} is already running")),
            Some(entry) => {
                entry.running = true;
                Ok(Self { id, cancel: entry.cancel.subscribe() })
            },
        }
    }

    fn is_cancelled(&self) -> bool {
        *self.cancel.borrow()
    }

    /// Resolves once the job is cancelled or released.
    async fn cancelled(&self) {
        let mut cancel = self.cancel.clone();
        // An error means the sender is gone: the job was released, which cancels it.
        let _ = cancel.wait_for(|cancelled| *cancelled).await;
    }

    /// Drive the future `make` returns on the shared runtime until it completes (`Some`) or
    /// the job is cancelled (`None`, the future dropped at its current await point). `make`
    /// runs inside the runtime, so it may create timers or spawn tasks.
    pub(crate) fn block_on<F: Future>(&self, make: impl FnOnce() -> F) -> Option<F::Output> {
        native::runtime().block_on(async {
            let future = make();
            tokio::select! {
                biased;
                () = self.cancelled() => None,
                output = future => Some(output),
            }
        })
    }

    /// Run blocking `work` on tokio's blocking pool, released at once on cancellation.
    pub(crate) fn blocking<T, F>(&self, work: F) -> Result<T, JobError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        match self.block_on(|| tokio::task::spawn_blocking(work)) {
            None => Err(JobError::Cancelled),
            Some(Ok(value)) => Ok(value),
            Some(Err(error)) if error.is_panic() => Err(JobError::Software(format!(
                "panicked: {}",
                native::panic_message(&*error.into_panic())
            ))),
            Some(Err(error)) => Err(JobError::Software(error.to_string())),
        }
    }
}

impl Drop for Job {
    fn drop(&mut self) {
        registry().remove(&self.id);
    }
}

fn outcome<T>(status: Status, value: Option<T>, error: Option<String>) -> JobOutcome<T> {
    JobOutcome { status: status.code(), value, error }
}

/// Run job `id` on the caller's thread and return its `JobOutcome<T>` JSON. The registry entry
/// is removed on every path, a panic included.
pub(crate) fn run<T: Serialize>(
    id: u64,
    operation: &str,
    work: impl FnOnce(&Job) -> Result<T, JobError>,
) -> String {
    let result = catch_unwind(AssertUnwindSafe(|| {
        let job = match Job::start(id) {
            Ok(job) => job,
            Err(message) => return outcome(Status::Usage, None, Some(message)),
        };
        if job.is_cancelled() {
            return outcome(Status::Cancelled, None, Some("cancelled".to_owned()));
        }
        match work(&job) {
            Ok(value) => outcome(Status::Ok, Some(value), None),
            Err(JobError::Failed(message)) => outcome(Status::Failed, None, Some(message)),
            Err(JobError::Usage(message)) => outcome(Status::Usage, None, Some(message)),
            Err(JobError::Software(message)) => {
                let message = format!("{operation} {message}");
                native::set_last_error(message.clone());
                outcome(Status::Software, None, Some(message))
            },
            Err(JobError::Cancelled) => {
                outcome(Status::Cancelled, None, Some("cancelled".to_owned()))
            },
        }
    }));
    let result = result.unwrap_or_else(|payload| {
        let message = format!("{operation} panicked: {}", native::panic_message(&*payload));
        native::set_last_error(message.clone());
        outcome(Status::Software, None, Some(message))
    });
    serde_json::to_string(&result).unwrap_or_else(|error| {
        format!(
            "{{\"status\":{},\"value\":null,\"error\":{}}}",
            Status::Software.code(),
            serde_json::Value::String(format!("{operation}: unserialisable result: {error}"))
        )
    })
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::*;

    fn parse(json: &str) -> serde_json::Value {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn a_job_is_single_use_and_always_unregistered() {
        let id = create();
        assert!(registry().contains_key(&id));
        let json = run(id, "test", |_| Ok(7_u32));
        assert_eq!(parse(&json), serde_json::json!({"status": 0, "value": 7, "error": null}));
        assert!(!registry().contains_key(&id), "the job removed its entry");
        let reused = parse(&run(id, "test", |_| Ok(7_u32)));
        assert_eq!(reused["status"], Status::Usage.code());
        assert!(reused["error"].as_str().unwrap().contains("single-use"));
        assert_eq!(parse(&run(0, "test", |_| Ok(()))).get("status").unwrap(), 64);
    }

    #[test]
    fn failures_carry_their_status_and_message() {
        for (error, status) in [
            (JobError::Failed("boom".into()), Status::Failed),
            (JobError::Usage("bad".into()), Status::Usage),
            (JobError::Software("crashed".into()), Status::Software),
            (JobError::Cancelled, Status::Cancelled),
        ] {
            let id = create();
            let value = parse(&run::<()>(id, "test", |_| Err(error)));
            assert_eq!(value["status"], status.code());
            assert!(value["value"].is_null());
            assert!(value["error"].is_string());
            assert!(!registry().contains_key(&id));
        }
    }

    #[test]
    fn a_panic_inside_a_job_is_caught_and_unregisters_it() {
        let id = create();
        let value = parse(&run::<()>(id, "shenron_test_job", |_| panic!("job exploded")));
        assert_eq!(value["status"], Status::Software.code());
        let message = value["error"].as_str().unwrap();
        assert!(message.contains("shenron_test_job panicked: job exploded"), "{message}");
        assert!(!registry().contains_key(&id));

        let id = create();
        let value = parse(&run::<()>(id, "shenron_test_job", |job| {
            job.blocking::<(), _>(|| panic!("blocking pool exploded"))
        }));
        assert_eq!(value["status"], Status::Software.code());
        assert!(value["error"].as_str().unwrap().contains("blocking pool exploded"));
        assert!(!registry().contains_key(&id));
    }

    #[test]
    fn a_job_cancelled_before_it_starts_returns_at_once() {
        let id = create();
        assert!(cancel(id));
        let value = parse(&run(id, "test", |_| -> Result<(), JobError> {
            unreachable!("a cancelled job never runs its work")
        }));
        assert_eq!(value["status"], Status::Cancelled.code());
        assert!(!cancel(id), "the entry is gone");
        assert!(!release(id));
    }

    #[test]
    fn cancellation_from_another_thread_interrupts_async_and_blocking_work() {
        for blocking in [false, true] {
            let id = create();
            let worker = std::thread::spawn(move || {
                let started = Instant::now();
                let json = run(id, "test", |job| {
                    if blocking {
                        job.blocking(|| std::thread::sleep(Duration::from_secs(30)))
                    } else {
                        job.block_on(|| tokio::time::sleep(Duration::from_secs(30)))
                            .ok_or(JobError::Cancelled)
                    }
                });
                (json, started.elapsed())
            });
            std::thread::sleep(Duration::from_millis(50));
            assert!(cancel(id));
            let (json, elapsed) = worker.join().unwrap();
            assert_eq!(parse(&json)["status"], Status::Cancelled.code());
            assert!(elapsed < Duration::from_secs(5), "cancelled after {elapsed:?}");
            assert!(!registry().contains_key(&id));
        }
    }

    #[test]
    fn releasing_a_running_job_cancels_it() {
        let id = create();
        let worker = std::thread::spawn(move || {
            run(id, "test", |job| {
                job.block_on(|| tokio::time::sleep(Duration::from_secs(30)))
                    .ok_or(JobError::Cancelled)
            })
        });
        std::thread::sleep(Duration::from_millis(50));
        assert!(release(id));
        assert_eq!(parse(&worker.join().unwrap())["status"], Status::Cancelled.code());
    }

    #[test]
    fn a_running_job_refuses_a_second_start() {
        let id = create();
        let first = Job::start(id).unwrap();
        assert!(Job::start(id).unwrap_err().contains("already running"));
        drop(first);
        assert!(!registry().contains_key(&id));
    }
}
