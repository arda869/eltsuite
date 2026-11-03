import type { GameRound } from './model';
import { norm } from './model';
export type AuctionState = {
    lot: number;
    bid: number;
    bidder: number;
    cash: number[];
    bought: {
        lot: number;
        team: number;
        price: number;
    }[];
    complete: boolean;
};
export const newAuction = (): AuctionState => ({ lot: 0, bid: 0, bidder: -1, cash: [100, 100], bought: [], complete: false });
export function AuctionBoard({ rounds, state, onChange, disabled }: {
    rounds: GameRound[];
    state: AuctionState;
    onChange: (s: AuctionState) => void;
    disabled: boolean;
}) {
    const s = state;
    const next = (sold: boolean) => { const cash = [...s.cash], bought = [...s.bought]; if (sold && s.bidder >= 0) {
        cash[s.bidder] -= s.bid;
        bought.push({ lot: s.lot, team: s.bidder, price: s.bid });
    } onChange({ ...s, cash, bought, lot: Math.min(s.lot + 1, rounds.length - 1), bid: 0, bidder: -1, complete: s.lot + 1 === rounds.length }); };
    return <div><p>Each team starts with 100 coins. Bid for sentences you think are correct. The highest bidder buys the sentence. The team that buys the most correct sentences wins; remaining coins break a tie.</p><div className="game-options">{s.cash.map((cash, i) => <section key={i}><h3>Team {i + 1}</h3><p>{cash} coins left</p>{!s.complete && <button type="button" disabled={disabled || cash < s.bid + 5} onClick={() => onChange({ ...s, bid: s.bid + 5, bidder: i })}>Bid {s.bid + 5} coins</button>}</section>)}</div>{s.complete ? <section role="status"><h2>Auction complete</h2>{s.cash.map((cash, i) => <p key={i}>Team {i + 1}: {s.bought.filter(b => b.team === i && norm(rounds[b.lot].answer) === 'correct').length} correct sentences · {cash} coins left</p>)}<ol>{rounds.map((r, i) => <li key={r.id}>{r.prompt} — <strong>{r.answer}</strong>{s.bought.some(b => b.lot === i) ? ` · Team ${s.bought.find(b => b.lot === i)!.team + 1}` : ' · Unsold'}</li>)}</ol></section> : <><p>Lot {s.lot + 1} of {rounds.length}</p><h2>{rounds[s.lot].prompt}</h2><p role="status">{s.bidder < 0 ? 'No bids yet.' : `Team ${s.bidder + 1} leads with ${s.bid} coins.`}</p><button type="button" disabled={disabled || s.bidder < 0} onClick={() => next(true)}>Going, going… sold!</button><button type="button" disabled={disabled || s.bidder >= 0} onClick={() => next(false)}>No bids — next sentence</button></>}</div>;
}
