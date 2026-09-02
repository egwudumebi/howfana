import {
  acceptAgreement,
  getAcceptedAgreementVersion,
  hasAcceptedAgreement,
} from '@/lib/legal/agreement';
import { LEGAL_AGREEMENT_VERSION } from '@/lib/constants';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';

const getItemAsync = SecureStore.getItemAsync as jest.Mock;
const setItemAsync = SecureStore.setItemAsync as jest.Mock;

describe('legal agreement', () => {
  beforeEach(() => {
    getItemAsync.mockReset();
    setItemAsync.mockReset();
  });

  it('requires current version to count as accepted', async () => {
    getItemAsync.mockResolvedValue(null);
    expect(await hasAcceptedAgreement()).toBe(false);

    getItemAsync.mockResolvedValue('0.9');
    expect(await hasAcceptedAgreement()).toBe(false);

    getItemAsync.mockResolvedValue(LEGAL_AGREEMENT_VERSION);
    expect(await hasAcceptedAgreement()).toBe(true);
  });

  it('stores the active agreement version on accept', async () => {
    await acceptAgreement();
    expect(setItemAsync).toHaveBeenCalledWith(
      'howfana.legal.agreementVersion',
      LEGAL_AGREEMENT_VERSION,
    );
  });

  it('reads the stored version', async () => {
    getItemAsync.mockResolvedValue(LEGAL_AGREEMENT_VERSION);
    expect(await getAcceptedAgreementVersion()).toBe(LEGAL_AGREEMENT_VERSION);
  });
});
