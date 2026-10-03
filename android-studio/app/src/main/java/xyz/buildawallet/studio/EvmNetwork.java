package xyz.buildawallet.studio;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

final class EvmNetwork {
    final String name;
    final String symbol;
    final long chainId;
    final String rpcUrl;

    private EvmNetwork(String name, String symbol, long chainId, String rpcUrl) {
        this.name = name;
        this.symbol = symbol;
        this.chainId = chainId;
        this.rpcUrl = rpcUrl;
    }

    static final EvmNetwork ETHEREUM = new EvmNetwork(
        "Ethereum", "ETH", 1L, "https://ethereum-rpc.publicnode.com");
    static final EvmNetwork BASE = new EvmNetwork(
        "Base", "ETH", 8453L, "https://mainnet.base.org");
    static final EvmNetwork POLYGON = new EvmNetwork(
        "Polygon", "POL", 137L, "https://polygon-rpc.com");
    static final EvmNetwork ARBITRUM = new EvmNetwork(
        "Arbitrum", "ETH", 42161L, "https://arb1.arbitrum.io/rpc");
    static final EvmNetwork OPTIMISM = new EvmNetwork(
        "Optimism", "ETH", 10L, "https://mainnet.optimism.io");
    static final EvmNetwork AVALANCHE = new EvmNetwork(
        "Avalanche", "AVAX", 43114L, "https://api.avax.network/ext/bc/C/rpc");
    static final EvmNetwork BNB = new EvmNetwork(
        "BNB Chain", "BNB", 56L, "https://bsc-dataseed.binance.org");

    private static final List<EvmNetwork> ALL = Collections.unmodifiableList(Arrays.asList(
        ETHEREUM, BASE, POLYGON, ARBITRUM, OPTIMISM, AVALANCHE, BNB
    ));

    static List<EvmNetwork> all() { return ALL; }

    static EvmNetwork byName(String name) {
        if (name != null) {
            for (EvmNetwork network : ALL) {
                if (network.name.equalsIgnoreCase(name.trim())) return network;
            }
        }
        return null;
    }

    static List<EvmNetwork> fromRequested(List<String> names) {
        ArrayList<EvmNetwork> selected = new ArrayList<>();
        if (names != null) {
            for (String name : names) {
                EvmNetwork network = byName(name);
                if (network != null && !selected.contains(network)) selected.add(network);
            }
        }
        if (selected.isEmpty()) {
            selected.add(ETHEREUM);
            selected.add(BASE);
            selected.add(POLYGON);
        }
        return selected;
    }

    @Override public String toString() { return name + " · " + symbol; }
}
