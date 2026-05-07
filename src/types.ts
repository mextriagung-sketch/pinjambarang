export type ItemCondition = 'Baik' | 'Rusak Ringan' | 'Rusak Berat';
export type LoanStatus = 'Dipinjam' | 'Kembali';

export interface Item {
  id: string;
  name: string;
  spec: string;
  totalQuantity: number;
  availableQuantity: number;
  image?: string;
}

export interface LoanRecord {
  id: string;
  itemId: string;
  itemName: string;
  borrower: string;
  borrowDate: string;
  expectedReturnDate: string;
  borrowCondition: ItemCondition;
  returnDate?: string;
  returnCondition?: ItemCondition;
  quantity: number;
  notes: string;
  status: LoanStatus;
  borrowerPhoto?: string;
  returnPhoto?: string;
}
