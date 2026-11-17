import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render-route';

const openPanel = () => {
  const trigger = screen.getByRole('button', { name: /what this tool sends where/i });
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole('dialog', { name: /what this tool sends where/i }) };
};

describe('"What this tool sends where" panel', () => {
  it('is reachable from the footer on every page', () => {
    for (const path of ['/', '/org/tu-delft', '/nope']) {
      renderRoute(path);
      const footer = screen.getByRole('contentinfo');
      expect(
        within(footer).getByRole('button', { name: /what this tool sends where/i }),
      ).toBeInTheDocument();
      cleanup();
    }
  });

  it('is closed until opened', () => {
    renderRoute('/');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists every third party a lookup contacts, and says we run no backend or analytics', () => {
    renderRoute('/org/tu-delft');
    const { dialog } = openPanel();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    for (const host of [
      'cloudflare-dns.com',
      'dns.google',
      'rdap.org',
      'data.iana.org',
      'asn.cymru.com',
      'crt.sh',
    ]) {
      expect(dialog).toHaveTextContent(host);
    }
    expect(dialog).toHaveTextContent(/registry/i);
    expect(dialog).toHaveTextContent(/no backend/i);
    expect(dialog).toHaveTextContent(/no analytics/i);
  });

  it('moves focus into the dialog and keeps Tab inside it', () => {
    renderRoute('/');
    const { dialog } = openPanel();
    const close = within(dialog).getByRole('button', { name: /close/i });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('closes on Escape and returns focus to the footer button', () => {
    renderRoute('/');
    const { trigger, dialog } = openPanel();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes with the close button', () => {
    renderRoute('/');
    const { dialog } = openPanel();
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when the route changes underneath it', async () => {
    const router = renderRoute('/');
    openPanel();
    await act(() => router.navigate('/org/tu-delft'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
