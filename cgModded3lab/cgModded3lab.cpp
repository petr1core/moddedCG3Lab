#include <random>
#include <SFML/Graphics.hpp>
#include <iostream>

int main()
{
	int w = 1920;    // window width
	int h = 1080;    // window height
	int mouseX = w / 2;    // mouse posX
	int mouseY = h / 2;    // mouse posy
	float mouseSensitivity = 3.0f;    // sens
	float speed = 0.33f;    // camera movement speed
	bool mouseHidden = true;
	bool wasdUD[6] = { false, false, false, false, false, false };    // pressed btns state array
	sf::Vector3f pos = sf::Vector3f(25.0f, 10.0f, -3.0f);    // camera position xyz
	sf::Clock clock;    // clock for animation, rendering & movement
	int samples = 20;    // amnt of iterations of sending rays (low -> worse & fast, high -> better & low)
	float lightSpeed = 0.000001f;   // global illumination change speed
	sf::Vector2f lightPos = sf::Vector2f(0.0f, -1.0f);    // GI pos
	bool is_rising = false;    // GI is underneath "earth"
	int frames = 0, s = 0, fps = 0, minFps;   // counters
	//sf::Vector2i delta = sf::Vector2i(1, 1);

	sf::RenderWindow window(sf::VideoMode(w, h), "Ray tracing", sf::Style::Titlebar | sf::Style::Close);    // sfml window
	window.setFramerateLimit(60);
	window.setMouseCursorVisible(false);

	sf::RenderTexture firstTexture;    // white texture (first texture before start of rendering)
	firstTexture.create(w, h);
	sf::Sprite firstTextureSprite = sf::Sprite(firstTexture.getTexture());
	sf::Sprite firstTextureSpriteFlipped = sf::Sprite(firstTexture.getTexture());
	firstTextureSpriteFlipped.setScale(1, -1);
	firstTextureSpriteFlipped.setPosition(0, h);

	sf::RenderTexture outputTexture;    // rendered texture (updates every frame)
	outputTexture.create(w, h);
	sf::Sprite outputTextureSprite = sf::Sprite(outputTexture.getTexture());
	sf::Sprite outputTextureSpriteFlipped = sf::Sprite(firstTexture.getTexture());
	outputTextureSpriteFlipped.setScale(1, -1);
	outputTextureSpriteFlipped.setPosition(0, h);

	sf::Shader shader;
	shader.loadFromFile("Shader.frag", sf::Shader::Fragment);    // loading frag shader as sfml frag shader
	shader.setUniform("u_resolution", sf::Vector2f(w, h));    // sending window resolution to frag shader

	// loading all textures for some objects
	sf::Texture texture;
	texture.loadFromFile("../textures/magma.jpg");
	sf::Texture brickTexture;
	brickTexture.loadFromFile("../textures/brick2.jpg");
	sf::Texture woodTexture;
	woodTexture.loadFromFile("../textures/wood2.jpg");
	sf::Texture marbleTexture;
	marbleTexture.loadFromFile("../textures/marble.jpg");

	// sending them to frag shader
	shader.setUniform("u_texture", texture);
	shader.setUniform("u_brick_texture", brickTexture);
	shader.setUniform("u_wood_texture", woodTexture);
	shader.setUniform("u_marble_texture", marbleTexture);

	std::random_device rd;    // random generator
	std::mt19937 e2(rd());    // second better random generator
	std::uniform_real_distribution<> dist(0.0f, 1.0f);    // better float vals generator [a,b)

	while (window.isOpen())
	{
		sf::Event event;
		while (window.pollEvent(event))
		{
			if (event.type == sf::Event::Closed)
			{
				window.close();
			}
			else if (event.type == sf::Event::MouseMoved)
			{
				if (mouseHidden)    // if we currently using camera 
				{
					// считаем отклонение и меняем переменную позиции
					int mx = event.mouseMove.x - w / 2;
					int my = event.mouseMove.y - h / 2;
					mouseX += mx;
					mouseY += my;
					sf::Mouse::setPosition(sf::Vector2i(w / 2, h / 2), window);    // возвращаем мышь обратно к центру экрана
				}
			}
			else if (event.type == sf::Event::MouseButtonPressed)    // if mouse clicked at the window area
			{
				window.setMouseCursorVisible(false);
				mouseHidden = true;
			}
			else if (event.type == sf::Event::KeyPressed)   
			{
				if (event.key.code == sf::Keyboard::Escape) // if escape pressed
				{
					window.setMouseCursorVisible(true);
					mouseHidden = false;
				}
				// if any control btn pressed we change its status in arrayto positive
				else if (event.key.code == sf::Keyboard::W) wasdUD[0] = true;  
				else if (event.key.code == sf::Keyboard::A) wasdUD[1] = true;
				else if (event.key.code == sf::Keyboard::S) wasdUD[2] = true;
				else if (event.key.code == sf::Keyboard::D) wasdUD[3] = true;
				else if (event.key.code == sf::Keyboard::Space) wasdUD[4] = true;
				else if (event.key.code == sf::Keyboard::C) wasdUD[5] = true;
				else if (event.key.code == sf::Keyboard::LShift) speed = 0.6f;
			}
			// if any control btn stopped being pressed we change its status in array to negative 
			else if (event.type == sf::Event::KeyReleased)
			{
				if (event.key.code == sf::Keyboard::W) wasdUD[0] = false;
				else if (event.key.code == sf::Keyboard::A) wasdUD[1] = false;
				else if (event.key.code == sf::Keyboard::S) wasdUD[2] = false;
				else if (event.key.code == sf::Keyboard::D) wasdUD[3] = false;
				else if (event.key.code == sf::Keyboard::Space) wasdUD[4] = false;
				else if (event.key.code == sf::Keyboard::C) wasdUD[5] = false;
				else if (event.key.code == sf::Keyboard::LShift) speed = 0.3f;
			}
		}
		if (mouseHidden)
		{
			// main body of interaction
			float mx = ((float)mouseX / w - 0.5f) * mouseSensitivity;
			float my = ((float)mouseY / h - 0.5f) * mouseSensitivity;
			//^^^ mouse pos change
			sf::Vector3f dir = sf::Vector3f(0.0f, 0.0f, 0.0f);
			//^^^ default camera direction
			sf::Vector3f dirTemp; // temporary dir
			if (wasdUD[0]) dir = sf::Vector3f(1.0f, 0.0f, 0.0f);    // едичничный вектор если W нажата
			else if (wasdUD[2]) dir = sf::Vector3f(-1.0f, 0.0f, 0.0f);    // едичничный вектор если A нажата
			if (wasdUD[1]) dir += sf::Vector3f(0.0f, -1.0f, 0.0f);    // едичничный вектор если S нажата
			else if (wasdUD[3]) dir += sf::Vector3f(0.0f, 1.0f, 0.0f);    // едичничный вектор если D нажата
			//____
			dirTemp.z = dir.z * cos(-my) - dir.x * sin(-my);
			dirTemp.x = dir.z * sin(-my) + dir.x * cos(-my);
			dirTemp.y = dir.y;
			dir.x = dirTemp.x * cos(mx) - dirTemp.y * sin(mx);
			dir.y = dirTemp.x * sin(mx) + dirTemp.y * cos(mx);
			dir.z = dirTemp.z;
			//^^^ просчёт изменения направления 
			pos += dir * speed;  // новая позиция = направление * скорость 
			if (wasdUD[4]) pos.z -= speed;    // Если C нажата, то смещение вниз
			else if (wasdUD[5]) pos.z += speed;    // Если Space нажата, то смещение вверх
			//___
			if (lightPos.y < 1 && !is_rising) {
				lightPos.y += lightSpeed;
				lightPos.x -= lightSpeed;
			}
			else if (lightPos.y > 1 && !is_rising) {
				lightPos.x = 2.0f;
				is_rising = true;
			}
			if (lightPos.y > -1 && is_rising) {
				lightPos.y -= lightSpeed;
				lightPos.x -= lightSpeed;
			}
			else if (lightPos.y <= -1 && is_rising) {
				is_rising = false;
			}
			///^^^ Просчёт изменения позиции GI с течением времени
			shader.setUniform("u_light", lightPos);
			shader.setUniform("u_pos", pos);
			shader.setUniform("u_samples", samples > 0 ? samples : 1);
			shader.setUniform("u_mouse", sf::Vector2f(mx, my));
			shader.setUniform("u_time", clock.getElapsedTime().asSeconds());
			shader.setUniform("u_seed1", sf::Vector2f((float)dist(e2), (float)dist(e2)) * 999.0f);
			shader.setUniform("u_seed2", sf::Vector2f((float)dist(e2), (float)dist(e2)) * 999.0f);
			//^^^ Передача всех переменных во фрагментный шейдер
			outputTexture.draw(firstTextureSpriteFlipped, &shader); // отправка на рендер
			window.draw(outputTextureSprite);  // обновление изображения в окне на отрендеренное
			window.display();
			//___
			/*if ((int)clock.getElapsedTime().asSeconds() - s) {
				s = clock.getElapsedTime().asSeconds();
				fps = frames;
				frames = 0;
				minFps = 15 + lightPos.y * -5;
				if (fps > minFps + 3) {
					samples += delta.x;
					delta = sf::Vector2i(delta.x + 1, 1);
				}
				else if (fps < minFps && samples > delta.y) {
					samples -= delta.y;
					delta = sf::Vector2i(1, delta.y + 1);
				}
				else { delta = sf::Vector2i(1, 1); }
				std::cout << "FPS: " << fps << ", Samples: " << samples << std::endl;
			}
			frames++;*/
			//^^^ debug статистика
		}
	}
	return 0;
}