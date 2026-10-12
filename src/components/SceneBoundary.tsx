'use client';
import { Component, type ReactNode } from 'react';

/** Contains 3D failures to the CAPITAL_MAP pane instead of crashing the dashboard. */
export class SceneBoundary extends Component<{ children: ReactNode; resetKey?: string }, { err: string | null; key?: string }> {
  state = { err: null as string | null, key: this.props.resetKey };
  static getDerivedStateFromError(e: Error) { return { err: e.message }; }
  static getDerivedStateFromProps(p: { resetKey?: string }, s: { err: string | null; key?: string }) { return p.resetKey !== s.key ? { err: null, key: p.resetKey } : null; }
  render() {
    return this.state.err
      ? <div className="err p-2 wrap" role="alert">[ERR] 3D scene failed ({this.state.err}) — see PATTERNS and DEAL_TABLE for the same data</div>
      : this.props.children;
  }
}
