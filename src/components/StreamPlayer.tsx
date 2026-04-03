export function StreamPlayer() {
  return (
    <div className="w-full aspect-video bg-black rounded-md overflow-hidden">
      <iframe
        src="https://stream.nichijou.network/labexclusive/"
        className="w-full h-full border-0"
        allowFullScreen
        allow="autoplay; fullscreen"
        title="hikkistream"
      />
    </div>
  );
}
