import ChatInterface from '@/components/ChatInterface';

export default function Home() {
  return (
    <main className="flex h-[100dvh] w-full flex-col items-center justify-center bg-black overflow-hidden p-4 md:p-8">
      <div className="z-10 w-full items-center justify-between text-sm lg:flex h-full">
        <ChatInterface />
      </div>
    </main>
  );
}
