import type { RootState } from "..";
import type {
  Customer,
  CustomerDetail,
  CustomerFilters,
  CustomerOverview,
  CustomerState,
  Payment,
} from "./type";

export const selectCustomerState = (state: RootState): CustomerState =>
  state.customer;

export const selectCustomers = (state: RootState): Customer[] =>
  state.customer.items;

export const selectCustomerTotal = (state: RootState): number =>
  state.customer.total;

export const selectCustomerPage = (state: RootState): number =>
  state.customer.page;

export const selectCustomerLimit = (state: RootState): number =>
  state.customer.limit;

export const selectCustomerFilters = (state: RootState): CustomerFilters =>
  state.customer.filters;

export const selectSelectedCustomerIds = (state: RootState): string[] =>
  state.customer.selectedIds;

export const selectIsCustomerSelected =
  (id: string) =>
  (state: RootState): boolean =>
    state.customer.selectedIds.includes(id);

export const selectIsCustomersLoading = (state: RootState): boolean =>
  state.customer.isLoading;

export const selectHasLoadedCustomers = (state: RootState): boolean =>
  state.customer.hasLoaded;

export const selectIsCustomerPending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(state.customer.pending[key]);

export const selectCustomerError = (state: RootState): string | null =>
  state.customer.error;

export const selectCustomerIssues = (
  state: RootState,
): Record<string, string> => state.customer.validationIssues;

export const selectAreAllCustomersSelected = (state: RootState): boolean =>
  state.customer.items.length > 0 &&
  state.customer.items.every((item) =>
    state.customer.selectedIds.includes(item.id),
  );

export const selectCustomerDetail = (state: RootState): CustomerDetail =>
  state.customer.detail;

export const selectDetailCustomer = (state: RootState): Customer | null =>
  state.customer.detail.customer;

export const selectCustomerOverview = (
  state: RootState,
): CustomerOverview | null => state.customer.detail.overview;

export const selectCustomerActivity = (state: RootState): Payment[] =>
  state.customer.detail.activity.items;

export const selectCustomerActivityTotal = (state: RootState): number =>
  state.customer.detail.activity.total;

export const selectCustomerActivityPage = (state: RootState): number =>
  state.customer.detail.activity.page;

export const selectCustomerActivityLimit = (state: RootState): number =>
  state.customer.detail.activity.limit;

export const selectIsCustomerDetailLoading = (state: RootState): boolean =>
  state.customer.detail.isLoading;

export const selectHasLoadedCustomerDetail = (state: RootState): boolean =>
  state.customer.detail.hasLoaded;
