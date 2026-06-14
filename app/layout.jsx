import './globals.css';

export const metadata = {
  title: 'LeaveFlow | Employee Leave Management',
  description: 'Employee leave management system built with Next.js and Express.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
