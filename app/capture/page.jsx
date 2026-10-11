import AuthGate from "@/components/AuthGate";
import ErrorBoundary from "@/components/ErrorBoundary";
import ExtensionSavePicker from "@/components/ExtensionSavePicker";

export const metadata = {
  title: "Save to Vault",
  description: "Choose a Vault collection for images captured in Chrome.",
};

export default function Page() {
  return <ErrorBoundary><AuthGate><ExtensionSavePicker /></AuthGate></ErrorBoundary>;
}
