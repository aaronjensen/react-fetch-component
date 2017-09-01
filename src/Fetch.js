import React, { Component } from 'react';

export default class Fetch extends Component {
  static defaultProps = {
    as: 'json'
  }

  state = {
    fetch: this.fetch.bind(this),
    loading: null,
  };
  cache = {};
  promises = [];

  getRequestProps() {
    const { url, options } = this.props;
    // Do not evaluate options here or it removes the benefits of passing it as a function (lazy evaluation)
    return { url, options };
  }

  getOptions(options) {
    return (typeof options === 'function') ? options() : options;
  }

  componentDidMount() {
    const { url, options, manual, onChange } = this.props;
    this.mounted = true;

    if (typeof onChange === 'function') {
      onChange({ request: this.getRequestProps(), ...this.state });
    }

    if (url && !manual) {
      this.fetch(url, options);
    }
  }

  componentDidUpdate(prevProps) {
    const { url, options, manual } = this.props;
    if (url !== prevProps.url && !manual) {
      this.fetch(url, options);
    }
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  fetch(url, options) {
    let { as, cache } = this.props;

    if (url == null) {
      url = this.props.url;
    }

    options = this.getOptions(options || this.props.options)

    if (cache && this.cache[url]) {
      // Restore cached state
      const promise = this.cache[url];
      promise.then(cachedState => this.update({ ...cachedState }, null, promise));
      this.promises.push(promise);
    } else {
      this.update({ loading: true });

      const promise = fetch(url, options)
        .then(response => {
          return response[as]()
            .then(data   => ({ response, data }))
            .catch(error => ({ response, data: error }))
        })
        .then(({ response, data }) => {
          const newState = {
            loading: false,
            [response.ok ? 'error' : 'data' ]: undefined, // Clear last response
            [response.ok ? 'data'  : 'error']: data,
            response
          }

          this.update(newState, null, promise);

          return newState;
        })
        .catch(error => {
          // Catch request errors with no response (CORS issues, etc)
          const newState = {
            data: undefined,
            error,
            loading: false
          }

          this.update(newState, null, promise);

          // Rethrow so not to swallow errors, especially from errors within handlers (children func / onChange)
          throw(error);

          return newState
        });

        this.promises.push(promise);

      if (cache) {
        this.cache[url] = promise;
      }
    }
  }

  update(nextState, callback, currentPromise) {
    if (currentPromise) {
      const index = this.promises.indexOf(currentPromise);
      if (index === -1) {
        // Ignore update as a later request/promise has already been processed
        return;
      }
      
      // Remove currently resolved promise and any outstanding promises
      // (which will cause them to be ignored when they do resolve/reject)
      this.promises.splice(0, index + 1);
    }

    const { onChange, onDataChange } = this.props;

    let data = undefined;
    if (nextState.data && nextState.data !== this.state.data && typeof onDataChange === 'function') {
      data = onDataChange(nextState.data, this.state.data)
    }

    if (typeof onChange === 'function') {
      // Always call onChange even if unmounted.  Useful for `POST` requests with a redirect
      onChange({ request: this.getRequestProps(), ...this.state, ...nextState });
    }

    // Ignore passing state down if no longer mounted
    if (this.mounted) {
      // If `onChange` prop returned a value, we use it for data passed down to the children function
      this.setState(data === undefined ? nextState : { ...nextState, data }, callback);
    }
  }

  render() {
    const { children } = this.props;
    const fetchProps = { request: this.getRequestProps(), ...this.state };
    return renderChildren(children, fetchProps);
  }
}

export function renderChildren(children, fetchProps) {
  if (typeof(children) === 'function') {
    const childrenResult = children(fetchProps);
    if (typeof childrenResult === 'function') {
      return renderChildren(childrenResult, fetchProps)
    } else {
      return childrenResult;
    }
  } else if (React.Children.count(children) === 0) {
    return null
  } else {
    // DOM/Component children
    // TODO: Better to check if children count === 1 and return null otherwise (like react-router)?
    //       Currently not possible to support multiple children components/elements (until React fiber)
    return React.Children.only(children)
  }
}
