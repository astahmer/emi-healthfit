{
  description = "Emi HealthFit development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              cacert
              curl
              direnv
              git
              jq
              nodejs_26
              openssl
              playwright-driver
              pnpm
              python3
            ];

            PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";

            shellHook = ''
              export PNPM_HOME="$PWD/.direnv/pnpm"
              export PATH="$PNPM_HOME:$PATH"
              mkdir -p "$PNPM_HOME"
            '';
          };
        }
      );
    };
}
