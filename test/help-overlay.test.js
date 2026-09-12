import { describe, it, expect } from 'vitest';
import { helpSectionsFromBindings, formatHelpKey } from '../src/ui/keyboard-controller.js';
import { DEFAULT_KEY_BINDINGS } from '../src/input-mapper.js';

describe('help overlay', () => {
  it('formats common keys the way the overlay prints them', () => {
    expect(formatHelpKey(' ')).toBe('Space');
    expect(formatHelpKey('escape')).toBe('Esc');
    expect(formatHelpKey('d')).toBe('D');
    expect(formatHelpKey('f11')).toBe('F11');
  });

  it('lists D for scene.switchMode and never Tab', () => {
    const grouped = helpSectionsFromBindings({
      ...DEFAULT_KEY_BINDINGS,
      tab: 'scene.switchMode',
    });
    const scene = grouped.get('SCENE');
    const switchRow = scene.find(r => r.label.includes('Switch OBJ'));
    expect(switchRow.key).toBe('D');
    expect(scene.every(r => r.key !== 'Tab')).toBe(true);
  });

  it('includes auto-set from the default map', () => {
    const grouped = helpSectionsFromBindings(DEFAULT_KEY_BINDINGS);
    const auto = grouped.get('SCOPE').find(r => r.label.toLowerCase().includes('auto-set'));
    expect(auto.key).toBe('A');
  });
});
