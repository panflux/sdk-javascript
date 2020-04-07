declare module "@panflux/sdk" {

    interface ClientOptions {
        authURL?: string;
        tokenURL?: string;
        state?: string;
        sameWindow?: boolean;
        returnURL?: string;
    }

    class Client extends EventEmitter {

        constructor(opts: ClientOptions, token: string|any);

        static init(opts: ClientOptions, token: string|any);
    
        async login(): Promise<any>;

        async requestToken(code: string, returnUrl: string): Promise<any>;
        async refreshToken(token: any): Promise<any>;
        async authenticate(): Promise<any>;
        async handleBrowserResult(result: string|any, returnUrl: string): Promise<boolean>

        async connect(): Promise<ApolloLink>
        async query(query: string, variables: any): Promise<any>;
        async subscribe(query: string, nextCallback: (data: any) => void, errorCallback: (err: any) => void, completeCallback: Function): Promise<ZenObservable.Subscription>;
        async getLink(): Promise<ApolloLink>;

        token: any;
        readonly resolving: boolean;
        readonly hasValidToken: boolean;

        on(event: 'newToken', listener: (token: any) => void): void;
        on(event: 'oauthError', listener: (errData: any) => void): void;
        on(event: 'startTokenRefresh', listener: () => void): void;
    }
}