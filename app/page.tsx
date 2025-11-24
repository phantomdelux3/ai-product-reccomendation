import ChatInterface from '@/components/ChatInterface';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-8 bg-black">
      <div className="z-10 w-full max-w-6xl items-center justify-between text-sm lg:flex h-[90vh]">
        <ChatInterface />
      </div>
    </main>
  );
}
