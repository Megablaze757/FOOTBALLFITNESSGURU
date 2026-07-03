import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="card w-full max-w-sm p-8 text-center">
        <div className="text-5xl font-extrabold">
          <span className="bg-gradient-to-br from-pitch-400 to-pitch-600 bg-clip-text text-transparent">404</span>
        </div>
        <h1 className="mt-3 text-lg font-extrabold">Page not found</h1>
        <p className="mt-1 text-sm text-slate-400">That page doesn&apos;t exist.</p>
        <Link href="/home" className="btn-primary mx-auto mt-6 max-w-[12rem]">Go home</Link>
      </div>
    </main>
  );
}
