import Spinner from "./components/Spinner";

// Shown while page.tsx runs detection on the server (picking a game / loading the wizard).
export default function Loading() {
  return (
    <div className="wrap" style={{ paddingTop: 28 }}>
      <div className="progress-note" style={{ marginTop: 0 }}>
        <Spinner /> Đang quét asset và tải dữ liệu game… có thể mất vài giây.
      </div>
      <div className="progress-bar" />
    </div>
  );
}
