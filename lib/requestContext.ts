import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  requestId: string;
  clientId: string | undefined;
}

const store = new AsyncLocalStorage<RequestContext>();

function getContext(): Partial<RequestContext> {
  return store.getStore() ?? {};
}

export { store, getContext };
