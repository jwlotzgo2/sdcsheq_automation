// lib/xero/getSupplierTransactions.ts
import { xeroGet } from './client'
import { XeroTransaction } from '@/lib/types/statement'

function parseXeroDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const match = raw.match(/\/Date\((\d+)/)
  if (match) {
    return new Date(parseInt(match[1])).toISOString().split('T')[0]
  }
  if (raw.includes('T') || raw.includes('-')) {
    return raw.split('T')[0]
  }
  return null
}

// Convert "YYYY-MM-DD" to Xero DateTime format: "DateTime(YYYY,MM,DD)"
function toXeroDateTime(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `DateTime(${y},${m},${d})`
}

export async function getSupplierTransactions(
  xeroContactId: string,
  dateFrom: string,
  dateTo: string
): Promise<XeroTransaction[]> {
  const transactions: XeroTransaction[] = []

  // Xero where syntax: use Guid(), DateTime(y,m,d), && for AND
  const billsWhere = encodeURIComponent(
    `Type=="ACCPAY"&&ContactID==Guid("${xeroContactId}")&&Date>=${toXeroDateTime(dateFrom)}&&Date<=${toXeroDateTime(dateTo)}`
  )
  const billsData = await xeroGet(
    `Invoices?where=${billsWhere}&order=Date`
  )

  // CreditNotes — fetch by date range, filter to supplier in JS
  let creditNotesData: any = { CreditNotes: [] }
  try {
    const cnWhere = encodeURIComponent(
      `Date>=${toXeroDateTime(dateFrom)}&&Date<=${toXeroDateTime(dateTo)}`
    )
    const allCN = await xeroGet(
      `CreditNotes?where=${cnWhere}`
    )
    // Filter to this supplier client-side
    creditNotesData = {
      CreditNotes: (allCN?.CreditNotes ?? []).filter(
        (cn: any) => cn.Contact?.ContactID === xeroContactId
      ),
    }
  } catch (err) {
    console.warn('[getSupplierTransactions] CreditNotes fetch failed, skipping:', err)
  }

  const bills = billsData?.Invoices ?? []
  if (bills.length === 100) {
    console.warn('[getSupplierTransactions] Bills response hit 100 limit — pagination may be needed')
  }

  for (const bill of bills) {
    transactions.push({
      xero_id: bill.InvoiceID,
      type: 'BILL',
      reference: bill.InvoiceNumber || null,
      date: parseXeroDate(bill.DateString) || parseXeroDate(bill.Date) || '',
      amount: Math.abs(bill.Total ?? 0),
      status: bill.Status || 'UNKNOWN',
    })

    if (bill.Payments && Array.isArray(bill.Payments)) {
      for (const pmt of bill.Payments) {
        transactions.push({
          xero_id: pmt.PaymentID,
          type: 'PAYMENT',
          reference: pmt.Reference || bill.InvoiceNumber || null,
          date: parseXeroDate(pmt.DateString) || parseXeroDate(pmt.Date) || '',
          amount: Math.abs(pmt.Amount ?? 0),
          status: 'PAID',
        })
      }
    }
  }

  const creditNotes = creditNotesData?.CreditNotes ?? []
  for (const cn of creditNotes) {
    transactions.push({
      xero_id: cn.CreditNoteID,
      type: 'CREDIT_NOTE',
      reference: cn.CreditNoteNumber || null,
      date: parseXeroDate(cn.DateString) || parseXeroDate(cn.Date) || '',
      amount: Math.abs(cn.Total ?? 0),
      status: cn.Status || 'UNKNOWN',
    })
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date))

  console.log(`[getSupplierTransactions] Found ${bills.length} bills, ${creditNotes.length} credit notes, ${transactions.filter(t => t.type === 'PAYMENT').length} payments`)

  return transactions
}
