import { useAppStore } from '../../store';
import { serializeProject } from '../../persistence';
import { buildViewLink } from './shareLink';

/**
 * v8: send the current project as a view link from the phone. Uses the phone's share
 * sheet (WhatsApp, AirDrop, Messages…) when there is one, otherwise copies the link.
 */
export async function sharePhoneLink(): Promise<void> {
  const state = useAppStore.getState();
  const snapshot = state.getSnapshot();
  const link = await buildViewLink(serializeProject(snapshot), window.location.href);
  const title = state.projectName || 'Projection Simulator';
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url: link });
      return;
    } catch (err) {
      // Closing the share sheet is not an error worth reporting.
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    useAppStore.setState({ projectMessage: 'Link copied. Imported images, videos and 3D models are not in it.' });
  } catch {
    window.prompt('Copy this link', link);
  }
}
