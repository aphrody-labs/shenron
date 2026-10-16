self.__BUILD_MANIFEST = {
  "__rewrites": {
    "afterFiles": [],
    "beforeFiles": [
      {
        "source": "/.well-known/mcp.json",
        "destination": "/api/mcp/card"
      },
      {
        "source": "/api/chronologie",
        "destination": "/api/timeline"
      },
      {
        "source": "/api/chronologie/:rest+",
        "destination": "/api/timeline/:rest+"
      },
      {
        "source": "/api/chronologie-config",
        "destination": "/api/timeline-config"
      },
      {
        "source": "/api/chronologie-config/:rest+",
        "destination": "/api/timeline-config/:rest+"
      },
      {
        "source": "/api/admin/entites",
        "destination": "/api/admin/entities"
      },
      {
        "source": "/api/admin/entites/:rest+",
        "destination": "/api/admin/entities/:rest+"
      },
      {
        "source": "/api/admin/ia",
        "destination": "/api/admin/ai"
      },
      {
        "source": "/api/admin/ia/:rest+",
        "destination": "/api/admin/ai/:rest+"
      },
      {
        "source": "/api/admin/databooks/campagne",
        "destination": "/api/admin/databooks/campaign"
      },
      {
        "source": "/api/admin/databooks/campagne/:rest+",
        "destination": "/api/admin/databooks/campaign/:rest+"
      },
      {
        "source": "/api/databooks/:id/textes",
        "destination": "/api/databooks/:id/texts"
      },
      {
        "source": "/api/databooks/:id/textes/:rest+",
        "destination": "/api/databooks/:id/texts/:rest+"
      },
      {
        "source": "/api/databooks/:id/relecture-ocr",
        "destination": "/api/databooks/:id/ocr-review"
      },
      {
        "source": "/api/databooks/:id/relecture-ocr/:rest+",
        "destination": "/api/databooks/:id/ocr-review/:rest+"
      },
      {
        "source": "/api/manga/chapter/:id/planche/:n/traduction",
        "destination": "/api/manga/chapter/:id/pages/:n/translation"
      },
      {
        "source": "/api/manga/chapter/:id/planche/:n/traduction/:rest+",
        "destination": "/api/manga/chapter/:id/pages/:n/translation/:rest+"
      },
      {
        "source": "/api/manga/chapter/:id/planche",
        "destination": "/api/manga/chapter/:id/pages"
      },
      {
        "source": "/api/manga/chapter/:id/planche/:rest+",
        "destination": "/api/manga/chapter/:id/pages/:rest+"
      }
    ],
    "fallback": [
      {
        "source": "/wiki/:path*"
      }
    ]
  },
  "sortedPages": [
    "/_app",
    "/_error"
  ]
};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()