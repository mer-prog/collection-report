import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import type { CollectionReportData } from "./slack-sender.server";

const LOW_STOCK_THRESHOLD = 10;

interface OrderLineItem {
  title: string;
  quantity: number;
  originalTotalSet: {
    shopMoney: {
      amount: string;
    };
  };
  variant: {
    id: string;
    inventoryQuantity: number;
  } | null;
  product: {
    id: string;
  } | null;
}

interface OrderEdge {
  node: {
    totalPriceSet: {
      shopMoney: {
        amount: string;
      };
    };
    lineItems: {
      edges: Array<{
        node: OrderLineItem;
      }>;
    };
  };
}

export async function generateReport(
  admin: AdminApiContext,
  collectionId: string,
  collectionTitle: string,
): Promise<CollectionReportData> {
  // Get products in the collection
  const productsInCollection = await fetchCollectionProducts(
    admin,
    collectionId,
  );
  const productIds = new Set(productsInCollection.map((p) => p.id));

  // Get orders from the last period (last 30 days for now)
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const orders = await fetchOrders(admin, thirtyDaysAgo);

  // Aggregate data
  let totalRevenue = 0;
  let totalUnitsSold = 0;
  const totalOrders = orders.length;
  const productSales = new Map<
    string,
    { title: string; unitsSold: number; revenue: number; inventory: number }
  >();

  for (const order of orders) {
    const orderTotal = parseFloat(
      order.node.totalPriceSet.shopMoney.amount,
    );

    // Check if any line item belongs to the collection
    let orderMatchesCollection = false;

    for (const lineItemEdge of order.node.lineItems.edges) {
      const lineItem = lineItemEdge.node;
      if (!lineItem.product || !productIds.has(lineItem.product.id)) continue;

      orderMatchesCollection = true;
      const revenue = parseFloat(
        lineItem.originalTotalSet.shopMoney.amount,
      );
      totalUnitsSold += lineItem.quantity;

      const existing = productSales.get(lineItem.product.id);
      if (existing) {
        existing.unitsSold += lineItem.quantity;
        existing.revenue += revenue;
        if (lineItem.variant) {
          existing.inventory = lineItem.variant.inventoryQuantity;
        }
      } else {
        productSales.set(lineItem.product.id, {
          title: lineItem.title,
          unitsSold: lineItem.quantity,
          revenue,
          inventory: lineItem.variant?.inventoryQuantity ?? 0,
        });
      }
    }

    if (orderMatchesCollection) {
      totalRevenue += orderTotal;
    }
  }

  // Top products by revenue
  const topProducts = Array.from(productSales.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({
      title: p.title,
      unitsSold: p.unitsSold,
      revenue: p.revenue,
      currentInventory: p.inventory,
    }));

  // Low stock products from collection
  const lowStockProducts = productsInCollection
    .flatMap((product) =>
      product.variants
        .filter((v) => v.inventoryQuantity <= LOW_STOCK_THRESHOLD)
        .map((v) => ({
          title: product.title,
          currentInventory: v.inventoryQuantity,
          variantTitle: v.title,
        })),
    );

  return {
    collectionTitle,
    period: {
      from: thirtyDaysAgo.toISOString().split("T")[0],
      to: now.toISOString().split("T")[0],
    },
    summary: {
      totalRevenue,
      totalOrders,
      totalUnitsSold,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    },
    topProducts,
    lowStockProducts,
  };
}

interface CollectionProduct {
  id: string;
  title: string;
  variants: Array<{
    title: string;
    inventoryQuantity: number;
  }>;
}

async function fetchCollectionProducts(
  admin: AdminApiContext,
  collectionId: string,
): Promise<CollectionProduct[]> {
  const products: CollectionProduct[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: Awaited<ReturnType<typeof admin.graphql>> =
      await admin.graphql(
        `#graphql
      query GetCollectionProducts($collectionId: ID!, $cursor: String) {
        collection(id: $collectionId) {
          products(first: 50, after: $cursor) {
            edges {
              node {
                id
                title
                variants(first: 50) {
                  edges {
                    node {
                      title
                      inventoryQuantity
                    }
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      }`,
        {
          variables: {
            collectionId,
            cursor,
          },
        },
      );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await response.json();
    const collection = json.data?.collection;
    if (!collection) break;

    const edges = collection.products.edges;
    for (const edge of edges) {
      products.push({
        id: edge.node.id,
        title: edge.node.title,
        variants: edge.node.variants.edges.map(
          (v: { node: { title: string; inventoryQuantity: number } }) => ({
            title: v.node.title,
            inventoryQuantity: v.node.inventoryQuantity,
          }),
        ),
      });
      cursor = edge.cursor;
    }

    hasNextPage = collection.products.pageInfo.hasNextPage;
  }

  return products;
}

async function fetchOrders(
  admin: AdminApiContext,
  since: Date,
): Promise<OrderEdge[]> {
  const orders: OrderEdge[] = [];
  let cursor: string | null = null;
  const sinceStr = since.toISOString();
  let hasNextPage = true;

  while (hasNextPage) {
    const response: Awaited<ReturnType<typeof admin.graphql>> =
      await admin.graphql(
        `#graphql
      query GetOrders($query: String!, $cursor: String) {
        orders(first: 50, after: $cursor, query: $query) {
          edges {
            node {
              totalPriceSet {
                shopMoney {
                  amount
                }
              }
              lineItems(first: 50) {
                edges {
                  node {
                    title
                    quantity
                    originalTotalSet {
                      shopMoney {
                        amount
                      }
                    }
                    variant {
                      id
                      inventoryQuantity
                    }
                    product {
                      id
                    }
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
          }
        }
      }`,
        {
          variables: {
            query: `created_at:>='${sinceStr}'`,
            cursor,
          },
        },
      );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await response.json();
    const ordersData = json.data?.orders;
    if (!ordersData) break;

    const edges = ordersData.edges;
    orders.push(...edges);
    cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;

    hasNextPage = ordersData.pageInfo.hasNextPage;
  }

  return orders;
}
