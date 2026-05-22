export type ClientOf<TServerAuth> = {
  getSession: () => Promise<any>;
  signOut: () => Promise<any>;
} & (TServerAuth extends { handlers: infer THandlers }
  ? {
      [PluginName in keyof THandlers]: {
        [HandlerName in keyof THandlers[PluginName]]: THandlers[PluginName][HandlerName] extends (...args: infer TArgs) => Promise<infer TResult>
          ? (...args: TArgs) => Promise<TResult>
          : never;
      };
    }
  : Record<string, never>);

export function createClient<TServerAuth>(config: { baseUrl: string }): ClientOf<TServerAuth> {
  const { baseUrl } = config;
  const cleanUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

  const makeRequest = async (path: string, method: string, body?: any) => {
    const res = await fetch(`${cleanUrl}/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return res.json();
  };

  const client = new Proxy({} as any, {
    get(target, prop) {
      const propStr = String(prop);
      if (propStr === "getSession") {
        return () => makeRequest("session", "GET");
      }
      if (propStr === "signOut") {
        return () => makeRequest("signout", "POST");
      }

      // Accessing a nested plugin namespace, e.g. client.password
      return new Proxy({} as any, {
        get(pluginTarget, handlerProp) {
          const handlerStr = String(handlerProp);
          return (input: any) => {
            return makeRequest(`${propStr}/${handlerStr}`, "POST", input);
          };
        }
      });
    }
  });

  return client as any as ClientOf<TServerAuth>;
}
