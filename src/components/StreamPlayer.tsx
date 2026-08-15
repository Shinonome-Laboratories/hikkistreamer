export function StreamPlayer() {
  return (
    <div className="w-full aspect-video bg-black rounded-md overflow-hidden">
      <iframe
        src="http://104.207.158.246:8889/ys2/"
        className="w-full h-full border-0"
        allowFullScreen
        allow="autoplay; fullscreen"
        title="hikkistream"
      />
    </div>
  );
}
