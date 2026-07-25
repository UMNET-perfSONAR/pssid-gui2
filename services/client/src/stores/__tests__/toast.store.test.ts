import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useToastStore } from '../toast.store';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toast store', () => {
  it('show() adds a live toast and a history entry', () => {
    const store = useToastStore();
    store.show('Saved', 'success');
    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0]).toMatchObject({ message: 'Saved', type: 'success' });
    expect(store.history[0]).toMatchObject({ message: 'Saved', type: 'success' });
  });

  it('defaults the type to info', () => {
    const store = useToastStore();
    store.show('Note');
    expect(store.toasts[0].type).toBe('info');
  });

  it('assigns a distinct id per toast (no same-millisecond collision)', () => {
    const store = useToastStore();
    store.show('a');
    store.show('b');
    expect(store.toasts[0].id).not.toBe(store.toasts[1].id);
  });

  it('auto-dismisses a toast after 4.5s but keeps it in history', () => {
    const store = useToastStore();
    store.show('temp');
    expect(store.toasts).toHaveLength(1);
    vi.advanceTimersByTime(4500);
    expect(store.toasts).toHaveLength(0);
    expect(store.history).toHaveLength(1);
  });

  it('dismiss() removes only the matching toast', () => {
    const store = useToastStore();
    store.show('a');
    store.show('b');
    store.dismiss(store.toasts[0].id);
    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0].message).toBe('b');
  });

  it('caps history at 20 entries, newest first', () => {
    const store = useToastStore();
    for (let i = 0; i < 25; i++) store.show(`msg-${i}`);
    expect(store.history).toHaveLength(20);
    expect(store.history[0].message).toBe('msg-24');
  });
});
