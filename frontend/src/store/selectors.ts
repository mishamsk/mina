type PublicStoreKey<TState extends object> = keyof {
  [
    TKey in keyof TState as TKey extends `_${string}` ? never : TKey
  ]: TState[TKey];
};

type BoundStore<TState extends object> = {
  getState: () => TState;
  <TSelection>(selector: (state: TState) => TSelection): TSelection;
};

type StoreWithSelectors<
  TState extends object,
  TStore extends BoundStore<TState>,
> = TStore & {
  use: {
    [TKey in PublicStoreKey<TState>]: () => TState[TKey];
  };
};

export const createSelectors = <
  TState extends object,
  TStore extends BoundStore<TState>,
>(
  store: TStore,
): StoreWithSelectors<TState, TStore> => {
  const storeWithSelectors = store as TStore & {
    use: Record<string, () => unknown>;
  };
  storeWithSelectors.use = {};

  for (const key of Object.keys(store.getState())) {
    if (key.startsWith("_")) {
      continue;
    }

    storeWithSelectors.use[key] = () =>
      store((state) => state[key as keyof TState]);
  }

  return storeWithSelectors as StoreWithSelectors<TState, TStore>;
};
