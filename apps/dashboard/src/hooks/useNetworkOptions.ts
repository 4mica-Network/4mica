import { networksForEnvironment, PAYMENT_NETWORKS } from "@4mica/rules";
import { useAppSelector } from "@stores/hooks";
import { selectEnvironment } from "@stores/project/selector";
import { environmentKind } from "@stores/project/type";

export const useEnvironmentNetworks = () =>
  networksForEnvironment(environmentKind(useAppSelector(selectEnvironment)));

export const useNetworkOptions = () =>
  useEnvironmentNetworks().map((value) => ({
    value,
    title: PAYMENT_NETWORKS[value].label,
  }));
