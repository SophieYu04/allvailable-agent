import Link from "next/link";
export default function PrivacyPage() {
  return <main className="legal-page"><Link className="login-back" href="/"><span>←</span>回到約嗎</Link><article><p className="section-kicker">PRIVACY</p><h1>隱私說明</h1><p>約嗎只保存完成登入、加入飯局和計算推薦所需的資料。Google subject 用來識別帳號，email 只供帳號管理；群組頁面顯示的是你設定的暱稱。</p><h2>你的時間</h2><p>完整紅黃綠日曆只提供給你本人。其他參加者只會看到推薦時段上必要的狀態，不會看到你的整份日曆。</p><h2>AI 輸入</h2><p>你選擇上傳的截圖會交由 Nebius Token Factory 辨識；錄音會交由 Cloudflare Workers AI 轉成文字，再交由 Nebius 上的 NVIDIA Nemotron 理解時間。辨識結果需經你確認才加入空檔草稿，提交仍由你決定。</p><h2>刪除資料</h2><p>你可以退出飯局或要求刪除帳號。歷史結果中的身份會被匿名化，已取消或拍板的飯局會在 30 天後清理。</p><h2>聯絡方式</h2><p>有任何刪除或濫用問題，請透過 GitHub Issues 聯絡我們。</p></article></main>;
}
