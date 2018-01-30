import {reportObservedDependency} from './autoDerive/discoveryMechanism'
import {default as DerivationEmitter} from './DerivationEmitter'
import * as debug from '$shared/debug'
import Ticker from '$src/shared/DataVerse/Ticker'
import Tappable from '$src/shared/DataVerse/utils/Tappable'

const FRESHNESS_STATE_NOT_APPLICABLE = 0
const FRESHNESS_STATE_STALE = 1
const FRESHNESS_STATE_FRESH = 2

type FreshnessState =
  | typeof FRESHNESS_STATE_NOT_APPLICABLE
  | typeof FRESHNESS_STATE_STALE
  | typeof FRESHNESS_STATE_FRESH

export interface IObjectWhoListensToAtomicUpdateNotices {
  _youMayNeedToUpdateYourself(msgComingFrom: AbstractDerivation<mixed>): void
}

export default abstract class AbstractDerivation<V>
  implements IObjectWhoListensToAtomicUpdateNotices {
  _id: number
  isDerivation: true = true
  _didNotifyDownstreamOfUpcomingUpdate: boolean
  _thereAreMoreThanOneDependents: boolean

  _freshnessState: FreshnessState
  _lastValue: $FixMe

  _dependents: Set<IObjectWhoListensToAtomicUpdateNotices>
  _dependencies: Set<AbstractDerivation<$IntentionalAny>>

  _trace: $FixMe
  abstract _recalculate(): V
  Type: V
  ChangeType: V

  constructor() {
    if (process.env.KEEPING_DERIVATION_TRACES === true) {
      this._trace = new Error('trace')
    }
    this._didNotifyDownstreamOfUpcomingUpdate = false
    this._id = lastDerivationId++
    this._freshnessState = FRESHNESS_STATE_NOT_APPLICABLE
    this._lastValue = undefined
    this._thereAreMoreThanOneDependents = false
    this._dependencies = new Set()
    this._dependents = new Set()
  }

  _addDependency(d: AbstractDerivation<$IntentionalAny>) {
    if (this._dependencies.has(d)) return
    this._dependencies.add(d)
    if (this._thereAreMoreThanOneDependents) d._addDependent(this as $FixMe)
  }

  _removeDependency(d: AbstractDerivation<$IntentionalAny>) {
    if (!this._dependencies.has(d)) return
    this._dependencies.delete(d)
    if (this._thereAreMoreThanOneDependents) d._removeDependent(this as $FixMe)
  }

  _removeAllDependencies() {
    this._dependencies.forEach(d => {
      this._removeDependency(d)
    })
  }

  changes(ticker: Ticker): Tappable<V> {
    return new DerivationEmitter(this, ticker).tappable()
  }

  tapImmediate(ticker: Ticker, fn: ((cb: $FixMe) => void)): $FixMe {
    const untap = this.changes(ticker).tap(fn)
    fn(this.getValue())
    return untap
  }

  _hasDependents() {
    return this._dependents.size !== 0
  }

  _addDependent(d: IObjectWhoListensToAtomicUpdateNotices) {
    const hadDepsBefore = this._dependents.size > 0
    this._dependents.add(d)
    const hasDepsNow = this._dependents.size > 0
    if (hadDepsBefore !== hasDepsNow) {
      this._reactToNumberOfDependentsChange()
    }
  }

  _removeDependent(d: IObjectWhoListensToAtomicUpdateNotices) {
    const hadDepsBefore = this._dependents.size > 0
    this._dependents.delete(d)
    const hasDepsNow = this._dependents.size > 0
    if (hadDepsBefore !== hasDepsNow) {
      this._reactToNumberOfDependentsChange()
    }
  }

  _youMayNeedToUpdateYourself(msgComingFrom: AbstractDerivation<mixed>): void
  _youMayNeedToUpdateYourself() {
    if (this._didNotifyDownstreamOfUpcomingUpdate) return

    this._didNotifyDownstreamOfUpcomingUpdate = true
    this._freshnessState = FRESHNESS_STATE_STALE

    if (this._hasDependents()) {
      this._dependents.forEach(dependent => {
        dependent._youMayNeedToUpdateYourself(this)
      })
    }
  }

  getValue(): V {
    reportObservedDependency(this)

    if (
      process.env.TRACKING_COLD_DERIVATIONS === true &&
      debug.findingColdDerivations &&
      !debug.skippingColdDerivations &&
      this._freshnessState === FRESHNESS_STATE_NOT_APPLICABLE
    ) {
      console.warn(`Perf regression: Unexpected cold derivation read`)
    }

    if (this._freshnessState !== FRESHNESS_STATE_FRESH) {
      const unboxed = this._recalculate()
      this._lastValue = unboxed
      if (this._freshnessState === FRESHNESS_STATE_STALE) {
        this._freshnessState = FRESHNESS_STATE_FRESH
        this._didNotifyDownstreamOfUpcomingUpdate = false
      }
    }
    return this._lastValue
  }

  _reactToNumberOfDependentsChange() {
    const thereAreMoreThanOneDependents = this._dependents.size > 0

    if (thereAreMoreThanOneDependents === this._thereAreMoreThanOneDependents)
      return

    this._thereAreMoreThanOneDependents = thereAreMoreThanOneDependents
    this._didNotifyDownstreamOfUpcomingUpdate = false

    if (thereAreMoreThanOneDependents) {
      this._freshnessState = FRESHNESS_STATE_STALE
      this._dependencies.forEach(d => {
        d._addDependent(this as $FixMe)
      })
      this._keepUptodate()
    } else {
      this._freshnessState = FRESHNESS_STATE_NOT_APPLICABLE
      this._dependencies.forEach(d => {
        d._removeDependent(this as $FixMe)
      })
      this._stopKeepingUptodate()
    }
  }

  _keepUptodate() {}

  _stopKeepingUptodate() {}

  map<T>(fn: (v: V) => T): AbstractDerivation<T> {
    return mapDerivation.default(this, fn)
  }

  flatMap<T, R extends AbstractDerivation<T>>(
    fn: (v: V) => R,
  ): AbstractDerivation<T> {
    return flatMapDerivation.default(this, fn)
  }

  flatten(): AbstractDerivation<$FixMe> {
    return this.flattenDeep(1)
  }

  flattenDeep(levels?: number): AbstractDerivation<$FixMe> {
    // $FixMe
    return flattenDeep.default(this as $FixMe, levels)
  }

  toJS() {
    return this.flatMap(toJS.default)
  }
}

export function isDerivation(d: any): d is AbstractDerivation<mixed> {
  return d && d.isDerivation && d.isDerivation === true
}

const flattenDeep = require('./flattenDeep')
const flatMapDerivation = require('./flatMapDerivation')
const mapDerivation = require('./mapDerivation')
const toJS = require('./toJS')

let lastDerivationId = 0
// setInterval(() => {
//   console.log(lastDerivationId, activeDs.size)
// }, 2000)
// let activeDs = new Set()
// import toCsv from 'json2csv'

// setTimeout(() => {console.log('allDs', lastDerivationId)}, 1500)
// setTimeout(() => {
//   // debugger
//   console.log('activeDs  ', activeDs.size)
//   console.log('allDs', lastDerivationId)
//   let activePointerDs = 0
//   activeDs.forEach((d) => {
//     if (d.inPointer === true) activePointerDs++
//   })
//   console.log('activePointerDs', activePointerDs)
// }, 1000)
//   const nodes = []
//   const edges = []

//   activeDs.forEach((d) => {
//     const node = {
//       id: d._id,
//       type: d.constructor.name,
//       hasTappers: d._changeEmitter.hasTappers(),
//     }

//     nodes.push(node)

//     d._dependents.forEach((dep) => {
//       edges.push({from: d._id, to: dep._id})
//     })
//   })

//   const nodesBlob = new Blob(
//     [toCsv({data: nodes, fields: ['id', 'type', 'hasTappers']})],
//     {type: 'text/plain'},
//   )

//   const edgesBlob = new Blob(
//     [toCsv({data: edges, fields: ['from', 'to']})],
//     {type: 'text/plain'},
//   )

//   window.open(window.URL.createObjectURL(nodesBlob))
//   window.open(window.URL.createObjectURL(edgesBlob))
// }, 2000)