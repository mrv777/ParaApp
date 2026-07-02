/**
 * One-time community-guidelines / EULA acceptance, shown before a user's first
 * post. Links out to the published policies on mrv777.com.
 */

import { View, Pressable, Linking } from 'react-native';

import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { useTranslation } from '@/i18n';
import { CHAT_LEGAL_URLS } from '@/constants/chat';

interface EulaSheetProps {
  visible: boolean;
  onAccept: () => void;
  onClose: () => void;
}

export function EulaSheet({ visible, onAccept, onClose }: EulaSheetProps) {
  const { t } = useTranslation();

  const link = (label: string, url: string) => (
    <Pressable onPress={() => Linking.openURL(url)} accessibilityRole="link">
      <Text variant="caption" color="success" className="py-1">
        {label} ↗
      </Text>
    </Pressable>
  );

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="px-4 pt-2 pb-4">
        <Text variant="subtitle" className="mb-2">
          {t('chat.eulaTitle')}
        </Text>
        <Text variant="body" color="muted" className="mb-3">
          {t('chat.eulaBody')}
        </Text>

        {link(t('chat.eulaGuidelines'), CHAT_LEGAL_URLS.guidelines)}
        {link(t('chat.eulaTerms'), CHAT_LEGAL_URLS.eula)}
        {link(t('chat.eulaPrivacy'), CHAT_LEGAL_URLS.privacy)}

        <View className="mt-4">
          <Button onPress={onAccept}>{t('chat.eulaAccept')}</Button>
        </View>
      </View>
    </Sheet>
  );
}
