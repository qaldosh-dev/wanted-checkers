import "./globals.css";

export const metadata = {
  title: "WANTED CHECKERS",
  description: "Minimal playable checkers MVP"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
