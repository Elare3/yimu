'use client';

import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { formatAmount, formatDate as fmtDate } from '@/lib/utils';

// 注册中文字体 — 使用阿里 CDN（国内可达）
const FONT_BASE = 'https://registry.npmmirror.com/@fontsource/noto-sans-sc/files';
Font.register({
  family: 'NotoSansSC',
  fonts: [
    { src: `${FONT_BASE}/noto-sans-sc-chinese-simplified-400-normal.woff`, fontWeight: 400 },
    { src: `${FONT_BASE}/noto-sans-sc-chinese-simplified-700-normal.woff`, fontWeight: 700 },
  ],
});

// 禁用连字和断字（避免 react-pdf 对中文的处理出错）
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansSC',
    fontSize: 10,
    padding: 40,
    color: '#3D3229',
    backgroundColor: '#FFFFFF',
  },
  // 头部
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: '#C47D3F',
  },
  brandName: {
    fontSize: 22,
    fontWeight: 700,
    color: '#C47D3F',
  },
  quoteTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#3D3229',
    marginTop: 4,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  quoteNumber: {
    fontSize: 9,
    color: '#8A7E72',
    marginBottom: 2,
  },
  headerDate: {
    fontSize: 9,
    color: '#8A7E72',
  },
  // 双列信息
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  infoBlock: {
    width: '48%',
    backgroundColor: '#FAF6F0',
    borderRadius: 6,
    padding: 12,
  },
  infoLabel: {
    fontSize: 8,
    color: '#8A7E72',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoName: {
    fontSize: 11,
    fontWeight: 700,
    color: '#3D3229',
    marginBottom: 3,
  },
  infoDetail: {
    fontSize: 9,
    color: '#6B5E53',
    lineHeight: 1.6,
  },
  // 表格
  table: {
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F5EDE3',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E8E0D4',
  },
  colName: { width: '36%' },
  colDesc: { width: '20%' },
  colQty: { width: '10%', textAlign: 'center' },
  colUnit: { width: '8%', textAlign: 'center' },
  colPrice: { width: '13%', textAlign: 'right' },
  colAmount: { width: '13%', textAlign: 'right' },
  thText: {
    fontSize: 8,
    fontWeight: 700,
    color: '#6B5E53',
  },
  tdText: {
    fontSize: 9,
    color: '#3D3229',
  },
  tdDesc: {
    fontSize: 8,
    color: '#8A7E72',
  },
  tdBold: {
    fontSize: 9,
    fontWeight: 700,
    color: '#3D3229',
  },
  // 汇总
  summaryContainer: {
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  summaryBox: {
    width: 220,
    backgroundColor: '#FAF6F0',
    borderRadius: 6,
    padding: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 9,
    color: '#6B5E53',
  },
  summaryValue: {
    fontSize: 9,
    color: '#3D3229',
  },
  summaryDivider: {
    borderTopWidth: 1,
    borderTopColor: '#C47D3F',
    marginVertical: 6,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#3D3229',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: 700,
    color: '#C47D3F',
  },
  // 条款
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: '#3D3229',
    marginBottom: 6,
    marginTop: 12,
  },
  sectionText: {
    fontSize: 9,
    color: '#6B5E53',
    lineHeight: 1.8,
  },
  // 页脚
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: '#E8E0D4',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: '#A69B90',
  },
});

// 包一层 null 防护：utils.formatDate 不接受 null/undefined，模板里 validUntil 等字段可能为空
function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '-';
  return fmtDate(d);
}

const formatMoney = formatAmount;

export interface QuotePDFData {
  quoteNumber: string;
  title: string;
  items: { name: string; description?: string; quantity: number; unit: string; unitPrice: number; amount: number }[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  paymentTerms: string;
  validUntil: string | null;
  notes: string;
  createdAt: string;
  client: { name: string; contactPerson: string; phone: string; email: string; address: string } | null;
  project: { name: string } | null;
  user: { name: string; companyName: string; phone: string };
}

export default function QuotePDFDocument({ data }: { data: QuotePDFData }) {
  return (
    <Document title={`报价单 - ${data.quoteNumber}`} author={data.user.companyName}>
      <Page size="A4" style={styles.page}>
        {/* 头部 */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandName}>{data.user.companyName || '一木'}</Text>
            <Text style={styles.quoteTitle}>{data.title}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.quoteNumber}>编号：{data.quoteNumber}</Text>
            <Text style={styles.headerDate}>日期：{formatDate(data.createdAt)}</Text>
            {data.validUntil && (
              <Text style={styles.headerDate}>有效期至：{formatDate(data.validUntil)}</Text>
            )}
          </View>
        </View>

        {/* 双列信息：发送方 / 客户 */}
        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>发送方</Text>
            <Text style={styles.infoName}>{data.user.companyName || data.user.name}</Text>
            {data.user.name && data.user.companyName && (
              <Text style={styles.infoDetail}>联系人：{data.user.name}</Text>
            )}
            {data.user.phone && <Text style={styles.infoDetail}>电话：{data.user.phone}</Text>}
          </View>
          {data.client && (
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>客户</Text>
              <Text style={styles.infoName}>{data.client.name}</Text>
              {data.client.contactPerson && <Text style={styles.infoDetail}>联系人：{data.client.contactPerson}</Text>}
              {data.client.phone && <Text style={styles.infoDetail}>电话：{data.client.phone}</Text>}
              {data.client.email && <Text style={styles.infoDetail}>邮箱：{data.client.email}</Text>}
            </View>
          )}
        </View>

        {/* 报价明细表 */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thText, styles.colName]}>服务项</Text>
            <Text style={[styles.thText, styles.colDesc]}>说明</Text>
            <Text style={[styles.thText, styles.colQty]}>数量</Text>
            <Text style={[styles.thText, styles.colUnit]}>单位</Text>
            <Text style={[styles.thText, styles.colPrice]}>单价</Text>
            <Text style={[styles.thText, styles.colAmount]}>金额</Text>
          </View>
          {data.items.map((item, idx) => (
            <View style={styles.tableRow} key={idx}>
              <Text style={[styles.tdText, styles.colName]}>{item.name}</Text>
              <Text style={[styles.tdDesc, styles.colDesc]}>{item.description || '-'}</Text>
              <Text style={[styles.tdText, styles.colQty]}>{item.quantity}</Text>
              <Text style={[styles.tdText, styles.colUnit]}>{item.unit}</Text>
              <Text style={[styles.tdText, styles.colPrice]}>{formatMoney(item.unitPrice)}</Text>
              <Text style={[styles.tdBold, styles.colAmount]}>{formatMoney(item.amount)}</Text>
            </View>
          ))}
        </View>

        {/* 金额汇总 */}
        <View style={styles.summaryContainer}>
          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>小计</Text>
              <Text style={styles.summaryValue}>{formatMoney(data.subtotal)}</Text>
            </View>
            {data.taxAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>税额 ({(data.taxRate * 100).toFixed(0)}%)</Text>
                <Text style={styles.summaryValue}>{formatMoney(data.taxAmount)}</Text>
              </View>
            )}
            {data.discount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>折扣</Text>
                <Text style={[styles.summaryValue, { color: '#6B8F3C' }]}>-{formatMoney(data.discount)}</Text>
              </View>
            )}
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>合计</Text>
              <Text style={styles.totalValue}>{formatMoney(data.total)}</Text>
            </View>
          </View>
        </View>

        {/* 付款条款 */}
        {data.paymentTerms && (
          <View>
            <Text style={styles.sectionTitle}>付款条款</Text>
            <Text style={styles.sectionText}>{data.paymentTerms}</Text>
          </View>
        )}

        {/* 备注 */}
        {data.notes && data.notes !== 'seed-data' && (
          <View>
            <Text style={styles.sectionTitle}>备注</Text>
            <Text style={styles.sectionText}>{data.notes}</Text>
          </View>
        )}

        {/* 页脚 */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>由一木 YiMu 生成</Text>
          <Text style={styles.footerText}>{data.quoteNumber}</Text>
        </View>
      </Page>
    </Document>
  );
}
