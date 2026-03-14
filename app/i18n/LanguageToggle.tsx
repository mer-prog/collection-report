import { Button, InlineStack } from "@shopify/polaris";
import { useTranslation, type Locale } from "./i18nContext";

export function LanguageToggle() {
  const { locale, setLocale } = useTranslation();

  const handleToggle = () => {
    const next: Locale = locale === "ja" ? "en" : "ja";
    setLocale(next);
  };

  return (
    <InlineStack gap="200" blockAlign="center">
      <Button
        size="slim"
        variant={locale === "en" ? "primary" : "tertiary"}
        onClick={() => setLocale("en")}
      >
        EN
      </Button>
      <Button
        size="slim"
        variant={locale === "ja" ? "primary" : "tertiary"}
        onClick={() => setLocale("ja")}
      >
        JA
      </Button>
    </InlineStack>
  );
}
