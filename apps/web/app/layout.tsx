import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "ATC Simulation",
    description: "Web-based ATC simulation training",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className={cn(inter.className, "min-h-screen bg-background font-sans antialiased")}>
                {children}
            </body>
        </html>
    );
}
