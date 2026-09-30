import Link from "next/link";
export default function TermsPage() {
  return <main className="legal-page"><Link className="login-back" href="/"><span>←</span>回到約嗎</Link><article><p className="section-kicker">TERMS</p><h1>服務條款</h1><p>約嗎提供多人安排聚餐時間的工具。請只建立你有權分享的活動內容，並對自己建立或加入的飯局負責。</p><h2>使用方式</h2><p>不得利用服務傳送違法、騷擾或冒用他人身份的內容。主揪可以刪除自己的飯局，成員可以退出。</p><h2>服務狀態</h2><p>這是以測試和 side project 為目標的服務，功能可能調整。資料保留與刪除依隱私說明執行。</p><h2>問題回報</h2><p>請透過 GitHub Issues 回報錯誤或濫用情況。</p></article></main>;
}
