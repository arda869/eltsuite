import { HUB_ACTIVITIES, type HubActivity } from './catalog';
import './hub-secondary.css';

export function HubBasket({ basketIds, onRemove, onClear, onOpen, onDiscover, onPrintDesk, activities: catalog = HUB_ACTIVITIES, syncStatus = 'browser' }: {
  basketIds: string[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onOpen: (id: string) => void;
  onDiscover: () => void;
  onPrintDesk: () => void;
  activities?: HubActivity[];
  syncStatus?: 'browser' | 'syncing' | 'synced' | 'error';
}) {
  const activities = [...new Set(basketIds)].map(id => catalog.find(activity => activity.id === id)).filter((activity): activity is HubActivity => !!activity && activity.status === 'ready');
  const learnerPages = activities.reduce((sum, activity) => sum + (activity.pages.filter(page => page.audience === 'learner').length || activity.editorSections?.filter(section => section.audience === 'learner').length || 0), 0);
  return <section className="rh-secondary-page" aria-labelledby="rh-basket-title">
    <header className="rh-secondary-header"><div><span className="rh-kicker">GATHER FOR CLASS</span><h1 id="rh-basket-title">Your basket</h1><p>Collect printable activities before making one classroom pack. {syncStatus === 'synced' ? 'Synced to your account.' : syncStatus === 'error' ? 'Saved on this browser; account sync is unavailable.' : syncStatus === 'syncing' ? 'Saving to your account…' : 'Saved on this browser.'}</p></div>{activities.length > 0 && <button type="button" className="rh-secondary-action" onClick={onClear}>Clear basket</button>}</header>
    {activities.length ? <div className="rh-basket-layout"><div className="rh-basket-items">{activities.map(activity => <article className="rh-secondary-card" key={activity.id}>
      <div className="rh-secondary-card-preview">{activity.pages.find(page => page.audience === 'learner')?.image ? <img src={activity.pages.find(page => page.audience === 'learner')!.image} alt="" /> : <span aria-hidden="true">✦</span>}</div>
      <div className="rh-secondary-card-body"><span className="rh-kicker">OFF THE PAGE · {activity.number}</span><h2>{activity.title}</h2><p>{activity.summary}</p><div className="rh-secondary-pills"><span>{activity.level}</span><span>{activity.minutes} min</span><span>{activity.pages.length ? `${activity.pages.filter(page => page.audience === 'learner').length} learner sheets` : `${activity.editorSections?.filter(section => section.audience === 'learner').length ?? 0} learner sections`}</span></div><div className="rh-secondary-card-actions"><button type="button" onClick={() => onOpen(activity.id)}>View activity</button><button type="button" onClick={() => onRemove(activity.id)} aria-label={`Remove ${activity.title} from basket`}>Remove</button></div></div>
    </article>)}</div><aside className="rh-basket-summary"><span className="rh-kicker">READY TO PRINT</span><h2>One pack, ready for class.</h2><p>{activities.length} {activities.length === 1 ? 'activity' : 'activities'} · {learnerPages} {learnerPages === 1 ? 'learner part' : 'learner parts'} per copy</p><p>Choose your pages and number of copies in Print Desk. You can add whole Class lessons there too. Teacher notes and answer keys stay in a separate section.</p><button type="button" className="rh-primary" onClick={onPrintDesk}>Open Print Desk <span aria-hidden="true">→</span></button></aside></div> : <div className="rh-empty"><span className="rh-empty-glyph" aria-hidden="true">▤</span><h2>Your basket is ready</h2><p>Add the complete “Have You Ever…?” activity, or assemble a pack from your Class lessons.</p><div className="rh-basket-empty-actions"><button type="button" className="rh-primary" onClick={onPrintDesk}>Open Print Desk →</button><button type="button" className="rh-secondary-action" onClick={onDiscover}>Browse activities</button></div></div>}
  </section>;
}
