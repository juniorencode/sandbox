/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MenuBar } from '../index.jsx';

const command = (id, group, title, extra = {}) => ({
  id,
  group,
  title,
  run: vi.fn(),
  ...extra
});

const commands = [
  command('run.now', 'Run', 'Run', { shortcut: 'Mod+Enter' }),
  command('output.clear', 'Run', 'Clear output', { shortcut: 'Mod+K' }),
  command('tab.new', 'Tabs', 'New tab', { shortcut: 'Mod+N' }),
  command('file.open', 'File', 'Open file…'),
  command('window.reload', 'Window', 'Reload window')
];

const open = async () => {
  const user = userEvent.setup();
  render(<MenuBar commands={commands} />);
  await user.click(screen.getByRole('button', { name: 'Application menu' }));
  return user;
};

/** The group rows, which are the only menuitems that own a submenu. */
const groupRows = () =>
  screen
    .getAllByRole('menuitem')
    .filter(node => node.getAttribute('aria-haspopup') === 'menu');

/**
 * The command entries. They carry role="menuitem", which overrides the
 * implicit button role, so querying for a button would not find them.
 */
const entries = () =>
  screen
    .getAllByRole('menuitem')
    .filter(node => node.getAttribute('aria-haspopup') !== 'menu');

describe('MenuBar', () => {
  it('shows nothing until the button is clicked', () => {
    render(<MenuBar commands={commands} />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lists one group per command group', async () => {
    await open();
    expect(groupRows().map(node => node.textContent)).toEqual([
      'Run',
      'Tabs',
      'File',
      'Window'
    ]);
  });

  it('keeps the declared order and appends anything unlisted', async () => {
    // A group nobody thought to place has to still appear, or adding one
    // would silently drop its commands from the menu.
    const user = userEvent.setup();
    render(
      <MenuBar
        commands={[...commands, command('x.y', 'Experiments', 'Something')]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Application menu' }));
    expect(groupRows().map(node => node.textContent).at(-1)).toBe(
      'Experiments'
    );
  });

  it('files a command with no group under Other rather than losing it', async () => {
    const user = userEvent.setup();
    render(<MenuBar commands={[command('loose', undefined, 'Loose')]} />);
    await user.click(screen.getByRole('button', { name: 'Application menu' }));
    expect(groupRows().map(node => node.textContent)).toEqual(['Other']);
  });

  it('opens a submenu on hover, with the bindings', async () => {
    const user = await open();
    await user.hover(groupRows()[0]);

    expect(entries().map(node => node.textContent)).toEqual([
      'RunCtrl+↵',
      'Clear outputCtrl+K'
    ]);
  });

  it('shows only one submenu at a time', async () => {
    const user = await open();
    await user.hover(groupRows()[0]);
    expect(entries()).toHaveLength(2);

    await user.hover(groupRows()[1]);
    const shown = entries().map(node => node.textContent);
    expect(shown).toEqual(['New tabCtrl+N']);
  });

  it('runs a command and closes', async () => {
    const user = await open();
    await user.hover(groupRows()[0]);
    await user.click(
      entries().find(node => node.textContent.startsWith('Clear output'))
    );

    expect(commands[1].run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape, since it covers the editor', async () => {
    const user = await open();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes when something outside it is pressed', async () => {
    const user = await open();
    await user.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('reopens with no submenu expanded', async () => {
    const user = await open();
    await user.hover(groupRows()[0]);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Application menu' }));
    expect(entries()).toHaveLength(0);
  });

  it('reports its state to assistive technology', async () => {
    const user = userEvent.setup();
    render(<MenuBar commands={commands} />);
    const button = screen.getByRole('button', { name: 'Application menu' });
    expect(button.getAttribute('aria-expanded')).toBe('false');

    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(groupRows()[0].getAttribute('aria-expanded')).toBe('false');

    await user.hover(groupRows()[0]);
    expect(groupRows()[0].getAttribute('aria-expanded')).toBe('true');
  });
});
