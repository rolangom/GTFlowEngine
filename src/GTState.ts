import { useState, useEffect } from "react";

type ICallback<T> = (v: T) => any;

export class BehaviorSubject<T> {
  _value: T;
  _callbacks: Array<ICallback<T>> = [];
  constructor(value: T) {
    this._value = value;
  }
  unsubscribe(callback: ICallback<T>) {
    this._callbacks = this._callbacks.filter(
      (it: ICallback<T>) => it !== callback
    );
  }
  subscribe(callback: ICallback<T>) {
    this._callbacks.push(callback);
    return () => this.unsubscribe(callback);
  }
  clear() {
    this._callbacks.forEach(this.unsubscribe);
    this._callbacks = [];
  }
  onNext(value: T) {
    this._value = value;
    this._callbacks.forEach((callback) => callback(this._value));
  }
  get value() {
    return this._value;
  }
}

export function createStore<T>(value: T) {
  const subject = new BehaviorSubject(value);

  function useSubscription(_setState: (v: T) => void) {
    useEffect(() => {
      const unsubscribe = subject.subscribe((v) => _setState(v));
      return unsubscribe;
    }, []);
  }

  function useStore(): [T, (v: T) => void] {
    const [state, _setState] = useState(subject._value);
    useSubscription(_setState);
    function setState(newValue: T) {
      console.log('newValue', newValue)
      subject.onNext(newValue);
    }
    return [state, setState];
  }

  function useSetValue(): ((v: T) => void) {
    function setState(newValue: T) {
      console.log('newValue', newValue)
      subject.onNext(newValue);
    }
    return setState;
  }

  function useValue() {
    const [state, _setState] = useState(subject._value);
    useSubscription(_setState)
    return state;
  }

  return { useStore, useSetValue, useValue };
}

export default createStore;
