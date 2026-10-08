import type { DisplayPreferences } from '../ui/preferences';
import { ru } from '../i18n/ru';

interface Props { preferences: DisplayPreferences; onChange: (value: DisplayPreferences) => void; systemReduced: boolean; warning: boolean }
export function DisplaySettings({ preferences, onChange, systemReduced, warning }: Props) {
  return <section id="display-settings" tabIndex={-1} className="display-settings" aria-label={ru.display.title}><details>
    <summary>{ru.display.title}</summary>
    <fieldset><legend>{ru.display.title}</legend>
      <label>{ru.display.theme}<select value={preferences.theme} onChange={event => onChange({ ...preferences, theme: event.target.value as DisplayPreferences['theme'] })}><option value="dark">{ru.display.dark}</option><option value="light">{ru.display.light}</option></select></label>
      <label className="check-row"><input type="checkbox" checked={preferences.largerText} onChange={event => onChange({ ...preferences, largerText: event.target.checked })} />{ru.display.largerText}</label>
      <label className="check-row"><input type="checkbox" checked={preferences.reduceMotion} onChange={event => onChange({ ...preferences, reduceMotion: event.target.checked })} />{ru.display.reduceMotion}</label>
    </fieldset>
    <p className="display-help">{systemReduced ? ru.display.systemReduced : ru.display.motionHint}</p>
  </details>{warning && <p className="warning" role="status">{ru.display.storageWarning}</p>}</section>;
}
