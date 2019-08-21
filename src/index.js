const DEFAULT_PROPS = {
    suffix: ["REQUEST", "SUCCESS", "ERROR"],
    delimeter: "_",
    responseType: "json",
    fetchOptions: {
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
        }
    },
    batchActions: true
};

export const createApiMiddleware = props => ({
    dispatch
}) => next => action => {
    if (!Array.isArray(action.types) || action.types.length === 0) {
        return next(action);
    }

    const finalProps = {
        ...DEFAULT_PROPS,
        ...props
    };

    const {
        delimeter,
        responseType,
        suffix,
        fetchOptions,
        batchActions
    } = finalProps;
    const [REQUEST, SUCCESS, FAILURE] = suffix;
    const { types, payload } = action;

    const bulkDispatch = fetchAction => {
        types.forEach(type => dispatch(fetchAction(type)));
    };

    const successDispatcher = (data, meta) => {
        bulkDispatch(type => ({
            type: `${type}${delimeter}${SUCCESS}`,
            payload: data,
            meta
        }));
    };

    const failureDispatcher = (data, meta) => {
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

    const requests = Array.isArray(payload) ? payload : [payload];

    return Promise.all(
        requests.map(
            request =>
                new Promise(async (resolve, reject) => {
                    const { onResponse, onFailure, url, key } = request;
                    let meta = null;
                    try {
                        const response = await fetch(url, fetchOptions);
                        meta = response;
                        const data = await response[responseType]();
                        !batchActions && successDispatcher(data, meta);
                        onResponse && onResponse(response);
                        resolve(
                            key
                                ? {
                                      [key]: data
                                  }
                                : data
                        );
                    } catch (err) {
                        onFailure && onFailure(err);
                        !batchActions && failureDispatcher(err, meta);
                        reject(err);
                    }
                })
        )
    )
        .then(response => {
            if (batchActions) {
                const data = response.reduce(
                    (data, result) => ({
                        ...data,
                        ...result
                    }),
                    {}
                );
                bulkDispatch(type => ({
                    type: `${type}${delimeter}${SUCCESS}`,
                    payload: data
                }));
            }
        })
        .catch(err => {
            batchActions && failureDispatcher(err);
        });
};
