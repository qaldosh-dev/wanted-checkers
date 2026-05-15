import "./globals.css";
import { AuthProvider } from "./auth-context";

export const metadata = {
  title: "WANTED CHECKERS",
  description: "Minimal playable checkers MVP"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
