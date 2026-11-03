import CardapioVirtualPage from './cardapio/page';

/**
 * A rota raiz (/) renderiza exclusivamente o Cardápio Virtual público.
 * Assim, mesmo que um cliente apague "/cardapio" da URL no navegador,
 * ele permanece apenas no Cardápio de Pedidos e jamais vê o sistema de gestão.
 * O painel de gestão fica isolado e protegido em /gestao.
 */
export default function HomePage() {
  return <CardapioVirtualPage />;
}
