type Semaphore = {
  max: number;
  active: number;
  queue: Array<() => void>;
};

const semaphores = new Map<string, Semaphore>();

function getSemaphore(modelId: string, maxConcurrency: number): Semaphore {
  let sem = semaphores.get(modelId);
  if (!sem) {
    sem = { max: maxConcurrency, active: 0, queue: [] };
    semaphores.set(modelId, sem);
  } else if (sem.max !== maxConcurrency) {
    sem.max = maxConcurrency;
  }
  return sem;
}

function acquire(sem: Semaphore): Promise<void> {
  if (sem.max <= 0) return Promise.resolve();
  if (sem.active < sem.max) {
    sem.active++;
    return Promise.resolve();
  }
  return new Promise<void>(resolve => {
    sem.queue.push(() => {
      sem.active++;
      resolve();
    });
  });
}

function release(sem: Semaphore): void {
  if (sem.max <= 0) return;
  sem.active--;
  if (sem.queue.length > 0) {
    const next = sem.queue.shift()!;
    next();
  }
}

export async function withConcurrencyLimit<T>(
  modelId: string,
  maxConcurrency: number,
  fn: () => Promise<T>
): Promise<T> {
  const sem = getSemaphore(modelId, maxConcurrency);
  await acquire(sem);
  try {
    return await fn();
  } finally {
    release(sem);
  }
}
