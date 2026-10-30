'use client';

export { LiveSharpeChart, type LiveSharpeChartProps } from './widget/LiveSharpeChart'
export { DrawdownAreaChart, type DrawdownAreaChartProps } from './widget/DrawdownAreaChart'

export {TradingChart,type TradingChartProps,type TradingChartEvents,type TradingChartInitialOptions} from './react/TradingChart'
export {TradingWorkspace,type TradingWorkspaceProps,type TradingWorkspaceInitialOptions,type ReactWorkspaceCellProps,type ReactWorkspaceCellReady,type OwnedWorkspaceStore} from './react/TradingWorkspace'

export {WorkspaceReplayError} from './replay/types'
export type {ReplayHistoryQuery,ReplayHistoryResult,ReplayBarClock,ReplayRequestContext,ReplaySpeed,WorkspaceReplayState,WorkspaceReplayRecord,ReplayBookmark,ReplayParticipantRecord,ReplayComparisonRecord} from './replay/types'
export type {WorkspaceDocument,ChartWorkspaceOptions} from './workspace/types'
