import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserDownload, platform, setPlatform, type Platform } from '../platform';
import { useRappels } from '../stores/rappels';
import { ReminderSettings } from './ReminderSettings';

// Rappels (phase 20) : réglage de l'appareil ; la notification est programmée par la plateforme.

const web = platform();
afterEach(() => setPlatform(web));
beforeEach(() => useRappels.setState({ actif: false, heure: 18 }));

function withReminders(granted: boolean) {
  const reminders = { schedule: vi.fn(async () => granted), cancel: vi.fn(async () => {}) };
  const local: Platform = {
    kind: 'local',
    saveFile: browserDownload,
    storageNotice: null,
    reminders,
  };
  setPlatform(local);
  return reminders;
}

describe('réglage du rappel quotidien', () => {
  it('dans le navigateur, dit que rien n’est programmé', () => {
    render(<ReminderSettings />);
    expect(screen.getByText(/Le navigateur n’envoie aucune notification/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('active, change l’heure puis désactive le rappel sur l’appareil', async () => {
    const reminders = withReminders(true);
    const user = userEvent.setup();
    render(<ReminderSettings />);
    const toggle = screen.getByRole('checkbox', {
      name: 'Me rappeler le défi du jour chaque jour',
    });
    expect(screen.getByLabelText('Heure du rappel')).toBeDisabled();
    await user.click(toggle);
    expect(reminders.schedule).toHaveBeenLastCalledWith(18);
    expect(toggle).toBeChecked();
    await user.selectOptions(screen.getByLabelText('Heure du rappel'), '20');
    expect(reminders.schedule).toHaveBeenLastCalledWith(20);
    expect(useRappels.getState()).toMatchObject({ actif: true, heure: 20 });
    await user.click(toggle);
    expect(reminders.cancel).toHaveBeenCalled();
    expect(useRappels.getState().actif).toBe(false);
  });

  it('explique un refus d’autorisation sans cocher la case', async () => {
    withReminders(false);
    const user = userEvent.setup();
    render(<ReminderSettings />);
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('alert')).toHaveTextContent('Notifications refusées');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
