type ResponseType = "json" | "text" | "formData" | "blob" | "arrayBuffer";

interface IApiMiddleware {
    suffix?: string[];
    delimeter?: string;
    baseResponseType?: ResponseType;
    baseFetchOptions?: RequestInit;
    batchActions?: boolean;
}

const DEFAULT_PROPS: IApiMiddleware = {
    suffix: ["REQUEST", "SUCCESS", "ERROR"],
    delimeter: "_",
    baseResponseType: "json",
    baseFetchOptions: {
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
        }
    },
    batchActions: true
};

interface IApiRequest {
    url: string;
    key?: string;
    onSuccess?: (data: any, response: Response) => void;
    onFailure?: (error: Error) => void;
    fetchOptions?: RequestInit;
    responseType?: ResponseType;
}

export interface IApiAction {
    types: string[];
    payload: {
        requests: IApiRequest | IApiRequest[];
        onSuccess?: (data: any) => void;
        onFailure?: (error: Error) => void;
    };
    meta?: any;
}

export const createApiMiddleware = (props?: IApiMiddleware) => ({ dispatch }) => next => (action: IApiAction) => {
    if (!Array.isArray(action.types) || action.types.length === 0) {
        return next(action as any);
    }

    const finalProps = {
        ...DEFAULT_PROPS,
        ...props
    };

    const { delimeter, baseResponseType, suffix, baseFetchOptions, batchActions } = finalProps;
    const [REQUEST, SUCCESS, FAILURE] = suffix;
    const { types, payload, meta } = action;

    const bulkDispatch = (fetchAction: (type: string) => any) => {
        types.forEach(type => dispatch(fetchAction(type)));
    };

    const successDispatcher = (data: any, meta?: any) => {
        bulkDispatch(type => ({
            type: `${type}${delimeter}${SUCCESS}`,
            payload: data,
            meta
        }));
    };

    const failureDispatcher = (data: any, meta?: any) => {
        bulkDispatch(type => ({
            type: `${type}${delimeter}${FAILURE}`,
            payload: data,
            error: true,
            meta
        }));
    };

    bulkDispatch(type => ({
        type: `${type}${delimeter}${REQUEST}`
    }));

    const requests = Array.isArray(payload.requests) ? payload.requests : [payload.requests];

    return Promise.all<any[]>(
        requests.map(
            request =>
                new Promise(async (resolve, reject) => {
                    const { onSuccess, onFailure, url, key, fetchOptions, responseType } = request;
                    let baseMeta = meta || {};
                    try {
                        const response = await fetch(url, {
                            ...baseFetchOptions,
                            ...fetchOptions
                        });
                        baseMeta["response"] = response;
                        const data = await response[responseType || baseResponseType]();
                        !batchActions && successDispatcher(data, baseMeta);
                        onSuccess && onSuccess(data, response);
                        resolve(
                            key
                                ? {
                                      [key]: data
                                  }
                                : data
                        );
                    } catch (err) {
                        onFailure && onFailure(err);
                        !batchActions && failureDispatcher(err, baseMeta);
                        reject(err);
                    }
                })
        )
    )
        .then((response: any[]) => {
            const data = response.reduce(
                (data, result) => ({
                    ...data,
                    ...result
                }),
                {}
            );

            if (batchActions) {
                successDispatcher(data, meta);
            }

            payload.onSuccess && payload.onSuccess(data);

            return data;
        })
        .catch(err => {
            batchActions && failureDispatcher(err, meta);
            payload.onFailure && payload.onFailure(err);

            return err;
        });
};
