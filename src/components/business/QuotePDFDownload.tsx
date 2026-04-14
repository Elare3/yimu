'use client';

import { useState } from 'react';
import type { QuotePDFData } from './QuotePDF';

interface Props {
  data: QuotePDFData;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatMoney(n: number): string {
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildHTML(data: QuotePDFData): string {
  const itemsRows = data.items.map((item) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #E8E0D4;">
        <div style="font-weight:600;color:#3D3229;">${item.name}</div>
        ${item.description ? `<div style="font-size:12px;color:#8A7E72;margin-top:2px;">${item.description}</div>` : ''}
      </td>
      <td style="padding:10px 8px;text-align:center;border-bottom:1px solid #E8E0D4;">${item.quantity}</td>
      <td style="padding:10px 8px;text-align:center;border-bottom:1px solid #E8E0D4;color:#8A7E72;">${item.unit}</td>
      <td style="padding:10px 8px;text-align:right;border-bottom:1px solid #E8E0D4;">${formatMoney(item.unitPrice)}</td>
      <td style="padding:10px 12px;text-align:right;border-bottom:1px solid #E8E0D4;font-weight:700;">${formatMoney(item.amount)}</td>
    </tr>
  `).join('');

  let summaryRows = `
    <tr><td style="padding:4px 0;color:#6B5E53;">小计</td><td style="padding:4px 0;text-align:right;">${formatMoney(data.subtotal)}</td></tr>
  `;
  if (data.taxAmount > 0) {
    summaryRows += `<tr><td style="padding:4px 0;color:#6B5E53;">税额 (${(data.taxRate * 100).toFixed(0)}%)</td><td style="padding:4px 0;text-align:right;">${formatMoney(data.taxAmount)}</td></tr>`;
  }
  if (data.discount > 0) {
    summaryRows += `<tr><td style="padding:4px 0;color:#6B5E53;">折扣</td><td style="padding:4px 0;text-align:right;color:#6B8F3C;">-${formatMoney(data.discount)}</td></tr>`;
  }

  return `
<div id="quote-pdf" style="font-family:-apple-system,'Microsoft YaHei','PingFang SC','Helvetica Neue',sans-serif;color:#3D3229;font-size:14px;line-height:1.6;padding:8px;width:760px;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:2.5px solid #C47D3F;margin-bottom:24px;">
    <div>
      <div style="font-size:26px;font-weight:800;color:#C47D3F;letter-spacing:1px;">${data.user.companyName || '一木'}</div>
      <div style="font-size:16px;font-weight:700;color:#3D3229;margin-top:4px;">${data.title}</div>
    </div>
    <div style="text-align:right;font-size:12px;color:#8A7E72;line-height:1.8;">
      <div>编号：${data.quoteNumber}</div>
      <div>日期：${formatDate(data.createdAt)}</div>
      ${data.validUntil ? `<div>有效期至：${formatDate(data.validUntil)}</div>` : ''}
    </div>
  </div>

  <div style="display:flex;gap:20px;margin-bottom:28px;">
    <div style="flex:1;background:#FAF6F0;border-radius:8px;padding:16px;">
      <div style="font-size:11px;color:#8A7E72;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">发送方</div>
      <div style="font-size:15px;font-weight:700;">${data.user.companyName || data.user.name}</div>
      ${data.user.name && data.user.companyName ? `<div style="font-size:13px;color:#6B5E53;margin-top:3px;">联系人：${data.user.name}</div>` : ''}
      ${data.user.phone ? `<div style="font-size:13px;color:#6B5E53;">电话：${data.user.phone}</div>` : ''}
    </div>
    ${data.client ? `
    <div style="flex:1;background:#FAF6F0;border-radius:8px;padding:16px;">
      <div style="font-size:11px;color:#8A7E72;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">客户</div>
      <div style="font-size:15px;font-weight:700;">${data.client.name}</div>
      ${data.client.contactPerson ? `<div style="font-size:13px;color:#6B5E53;margin-top:3px;">联系人：${data.client.contactPerson}</div>` : ''}
      ${data.client.phone ? `<div style="font-size:13px;color:#6B5E53;">电话：${data.client.phone}</div>` : ''}
      ${data.client.email ? `<div style="font-size:13px;color:#6B5E53;">邮箱：${data.client.email}</div>` : ''}
    </div>` : ''}
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;">
    <thead>
      <tr style="background:#F5EDE3;">
        <th style="text-align:left;padding:10px 12px;font-size:12px;font-weight:600;color:#6B5E53;">服务项</th>
        <th style="text-align:center;padding:10px 8px;font-size:12px;font-weight:600;color:#6B5E53;width:60px;">数量</th>
        <th style="text-align:center;padding:10px 8px;font-size:12px;font-weight:600;color:#6B5E53;width:50px;">单位</th>
        <th style="text-align:right;padding:10px 8px;font-size:12px;font-weight:600;color:#6B5E53;width:100px;">单价</th>
        <th style="text-align:right;padding:10px 12px;font-size:12px;font-weight:600;color:#6B5E53;width:100px;">金额</th>
      </tr>
    </thead>
    <tbody>${itemsRows}</tbody>
  </table>

  <div style="display:flex;justify-content:flex-end;margin-bottom:28px;">
    <div style="width:240px;background:#FAF6F0;border-radius:8px;padding:16px;">
      <table style="width:100%;font-size:13px;">
        ${summaryRows}
        <tr><td colspan="2" style="padding:8px 0 0;"><div style="border-top:2px solid #C47D3F;"></div></td></tr>
        <tr>
          <td style="padding:8px 0 0;font-size:15px;font-weight:700;">合计</td>
          <td style="padding:8px 0 0;text-align:right;font-size:20px;font-weight:800;color:#C47D3F;">${formatMoney(data.total)}</td>
        </tr>
      </table>
    </div>
  </div>

  ${data.paymentTerms ? `
  <div style="margin-bottom:16px;">
    <div style="font-size:14px;font-weight:700;margin-bottom:6px;">付款条款</div>
    <div style="font-size:13px;color:#6B5E53;line-height:1.8;white-space:pre-wrap;">${data.paymentTerms}</div>
  </div>` : ''}

  ${data.notes && data.notes !== 'seed-data' ? `
  <div style="margin-bottom:16px;">
    <div style="font-size:14px;font-weight:700;margin-bottom:6px;">备注</div>
    <div style="font-size:13px;color:#6B5E53;line-height:1.8;white-space:pre-wrap;">${data.notes}</div>
  </div>` : ''}

  <div style="margin-top:40px;padding-top:12px;border-top:1px solid #E8E0D4;display:flex;justify-content:space-between;font-size:11px;color:#A69B90;">
    <span>由一木 YiMu 生成</span>
    <span>${data.quoteNumber}</span>
  </div>
</div>`;
}

export default function QuotePDFDownload({ data }: Props) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      // 创建离屏容器，让内容完全展开
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '760px';
      container.style.overflow = 'visible';
      container.innerHTML = buildHTML(data);
      document.body.appendChild(container);

      const element = container.firstElementChild as HTMLElement;

      // 截取完整内容为 canvas
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        scrollY: 0,
        windowWidth: 760,
      });

      document.body.removeChild(container);

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdfWidth = 210; // A4 宽 mm
      const margin = 10;
      const contentWidth = pdfWidth - margin * 2;
      const contentHeight = (canvas.height * contentWidth) / canvas.width;
      const pageHeight = 297 - margin * 2; // A4 高 - 上下边距

      const pdf = new jsPDF('portrait', 'mm', 'a4');

      // 如果内容不超过一页，直接放
      if (contentHeight <= pageHeight) {
        pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, contentHeight);
      } else {
        // 多页：按页高切割 canvas，逐页添加
        const totalPages = Math.ceil(contentHeight / pageHeight);
        for (let i = 0; i < totalPages; i++) {
          if (i > 0) pdf.addPage();

          const sourceY = (i * pageHeight * canvas.width) / contentWidth;
          const sliceHeight = Math.min(
            (pageHeight * canvas.width) / contentWidth,
            canvas.height - sourceY
          );

          // 创建该页的 canvas 切片
          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = canvas.width;
          pageCanvas.height = sliceHeight;
          const ctx = pageCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

          const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.95);
          const sliceContentHeight = (sliceHeight * contentWidth) / canvas.width;
          pdf.addImage(pageImgData, 'JPEG', margin, margin, contentWidth, sliceContentHeight);
        }
      }

      pdf.save(`报价单_${data.quoteNumber}.pdf`);
    } catch (e) {
      console.error('PDF generation failed:', e);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={generating}
      className="inline-flex items-center justify-center w-full px-6 py-3 rounded-[14px] text-sm font-semibold text-white bg-gradient-to-r from-caramel to-caramel-light hover:shadow-lg hover:shadow-caramel/25 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {generating ? (
        <>
          <div className="h-4 w-4 rounded-full animate-spin border-2 border-white/30 border-t-white mr-2" />
          正在生成...
        </>
      ) : '下载 PDF'}
    </button>
  );
}
