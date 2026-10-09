import type { DisplayPreferences } from '../ui/preferences';
import { ru } from '../i18n/ru';
import type { LocalSpeech } from '../ui/speech';
import { guidanceRu, speechRu } from '../i18n/guidance-ru';

interface Props { preferences: DisplayPreferences; onChange: (value: DisplayPreferences) => void; systemReduced: boolean; warning: boolean; speech: LocalSpeech }
export function DisplaySettings({ preferences, onChange, systemReduced, warning, speech }: Props) {
  return <section id="display-settings" tabIndex={-1} className="display-settings" aria-label={ru.display.title}>
    <div className="speech-controls"><label className="check-row"><input type="checkbox" checked={speech.enabled} onChange={event => speech.controller.setEnabled(event.target.checked)} />{guidanceRu.enable}</label><button type="button" onClick={speech.controller.stop}>{guidanceRu.stop}</button></div>
    <p role="status" aria-live="polite" data-testid="speech-status">{speechRu[speech.status]}</p><details>
    <summary>{ru.display.title}</summary>
    <fieldset><legend>{ru.display.title}</legend>
      <label>{ru.display.theme}<select value={preferences.theme} onChange={event => onChange({ ...preferences, theme: event.target.value as DisplayPreferences['theme'] })}><option value="dark">{ru.display.dark}</option><option value="light">{ru.display.light}</option></select></label>
      <label className="check-row"><input type="checkbox" checked={preferences.largerText} onChange={event => onChange({ ...preferences, largerText: event.target.checked })} />{ru.display.largerText}</label>
      <label className="check-row"><input type="checkbox" checked={preferences.reduceMotion} onChange={event => onChange({ ...preferences, reduceMotion: event.target.checked })} />{ru.display.reduceMotion}</label>
      <label>{guidanceRu.rate}<input type="number" min="0.7" max="1.5" step="0.1" value={speech.preferences.rate} onChange={event => { const rate = Number(event.target.value); if (event.target.value !== '' && rate >= .7 && rate <= 1.5) speech.changePreferences({ ...speech.preferences, rate }); }} /></label>
      <label>{guidanceRu.voice}<select value={speech.voices.some(voice => voice.voiceURI === speech.preferences.voiceURI) ? speech.preferences.voiceURI : ''} onChange={event => speech.changePreferences({ ...speech.preferences, voiceURI: event.target.value })}><option value="">{guidanceRu.defaultVoice}</option>{speech.voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>)}</select></label>
    </fieldset>
    <p className="display-help">{systemReduced ? ru.display.systemReduced : ru.display.motionHint}</p>
  </details>{warning && <p className="warning" role="status">{ru.display.storageWarning}</p>}{speech.warning && <p className="warning" role="status">{guidanceRu.storageWarning}</p>}</section>;
}
