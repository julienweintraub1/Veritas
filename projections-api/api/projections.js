const fetch = require('node-fetch');
const cheerio = require('cheerio');

// FantasyPros URLs by position
const URLS = {
    QB: 'https://www.fantasypros.com/nfl/projections/qb.php',
    RB: 'https://www.fantasypros.com/nfl/projections/rb.php',
    WR: 'https://www.fantasypros.com/nfl/projections/wr.php',
    TE: 'https://www.fantasypros.com/nfl/projections/te.php',
    K: 'https://www.fantasypros.com/nfl/projections/k.php',
    DST: 'https://www.fantasypros.com/nfl/projections/dst.php'
};

// Column indices for REC and FPTS (0-based)
const INDICES = {
    QB: { name: 0, rec: -1, pts: 10 },
    RB: { name: 0, rec: 4, pts: 8 },
    WR: { name: 0, rec: 1, pts: 8 },
    TE: { name: 0, rec: 1, pts: 5 },
    K: { name: 0, rec: -1, pts: 4 },
    DST: { name: 0, rec: -1, pts: 9 }
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const allProjections = [];

        for (const [position, url] of Object.entries(URLS)) {
            try {
                const response = await fetch(url);
                const html = await response.text();
                const $ = cheerio.load(html);
                const indices = INDICES[position];

                $('#data tbody tr').each((i, row) => {
                    const $cells = $(row).find('td');

                    const nameFull = $cells.eq(indices.name).find('a').first().text().trim() ||
                        $cells.eq(indices.name).text().split('(')[0].trim();

                    // FantasyPros usually displays Half-PPR by default in their "FPTS" column
                    const rawPts = parseFloat($cells.eq(indices.pts).text().trim()) || 0;
                    const rec = indices.rec >= 0 ? parseFloat($cells.eq(indices.rec).text().trim()) || 0 : 0;

                    if (nameFull && rawPts > 0) {
                        // Calculate format-specific projections (assuming rawPts is Half-PPR)
                        const half = rawPts;
                        const std = parseFloat((half - (rec * 0.5)).toFixed(1));
                        const ppr = parseFloat((half + (rec * 0.5)).toFixed(1));

                        allProjections.push({
                            name: nameFull,
                            position: position === 'DST' ? 'DEF' : position,
                            projections: { std, ppr, half }
                        });
                    }
                });
            } catch (err) {
                console.error(`Error scraping ${position}:`, err);
            }
        }

        res.status(200).json({
            success: true,
            count: allProjections.length,
            projections: allProjections,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
