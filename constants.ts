import { Language, TranslationKey, TranslationValue } from './types';

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'InglÃªs (Base)', flag: 'ðŸ‡ºðŸ‡¸' },
  { code: 'pt-BR', name: 'PortuguÃªs', flag: 'ðŸ‡§ðŸ‡·' },
  { code: 'es', name: 'Espanhol', flag: 'ðŸ‡ªðŸ‡¸' },
  { code: 'fr', name: 'FrancÃªs', flag: 'ðŸ‡«ðŸ‡·' },
  { code: 'de', name: 'AlemÃ£o', flag: 'ðŸ‡©ðŸ‡ª' },
  { code: 'it', name: 'Italiano', flag: 'ðŸ‡®ðŸ‡¹' },
  { code: 'ja', name: 'JaponÃªs', flag: 'ðŸ‡¯ðŸ‡µ' },
];

export const MOCK_KEYS: TranslationKey[] = [
  { id: '1', key: 'app_title', tags: ['general'] },
  { id: '2', key: 'welcome_message', tags: ['dashboard'] },
  { id: '3', key: 'login_button', tags: ['auth'] },
  { id: '4', key: 'logout_description', tags: ['auth'] },
  { id: '5', key: 'pricing_tier_pro', tags: ['marketing'] },
  { id: '6', key: 'terms_of_service', tags: ['legal'] },
];

export const MOCK_VALUES: Record<string, TranslationValue> = {
  '1': {
    'en': 'Kraken i18n',
    'pt-BR': 'Kraken i18n',
    'es': 'Kraken i18n',
    'fr': 'Kraken i18n'
  },
  '2': {
    'en': 'Welcome back to your dashboard, user!',
    'pt-BR': 'Bem-vindo de volta ao seu painel, usuÃ¡rio!',
    'es': 'Â¡Bienvenido de nuevo a su panel, usuario!'
  },
  '3': {
    'en': 'Sign In',
    'pt-BR': 'Entrar'
  },
  '4': {
    'en': 'Click here to log out of your account safely.',
    'fr': 'Cliquez ici pour vous dÃ©connecter en toute sÃ©curitÃ©.'
  },
  '5': {
    'en': 'Pro Plan',
    'pt-BR': 'Plano Pro',
    'de': 'Pro-Plan'
  },
  '6': {
    'en': '# Terms of Service\n\nBy using this app, you agree to:\n- Be **nice**\n- Write *good* code\n\n## Data Policy\nWe respect your privacy.'
  }
};
